import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import {
  countGoogleReviewsLinked,
  countLinkedReviewsOfAsked,
  countReviewsToMatch,
  listReviewsToMatch,
  possibleCustomerMatchLink,
  readCustomerReviews,
  readReviewTab,
  suggestionsForReview,
} from "@/lib/crm/google-review-match-server";
import { linkGoogleReview, rejectGoogleReviewMatch, unlinkGoogleReview } from "@/lib/crm/google-review-links";
import { countGoogleReviewsToMatch } from "@/lib/crm/telegram-update-sources";
import { reviewFacts } from "@/lib/crm/reviews";
import { fakeReviewsAdmin } from "./google-review-fake";

/**
 * Reviews on every Customer (CRM slice 12): the reads around
 * `google_review_match_candidates()` and the Staff actions, against an
 * in-memory database. Fixtures: Jane Tan asked 9 days before her review and
 * clicked the day before; two Bobs delivered 20 days before a review signed
 * "Bob"; an anonymous review; a review from someone we never asked.
 */

const JANE = "c0000000-0000-4000-8000-000000000001";
const BOB_LEE = "c0000000-0000-4000-8000-000000000004";
const BOB_ONG = "c0000000-0000-4000-8000-000000000005";
const R_JANE = "e0000000-0000-4000-8000-000000000001";
const R_BOB = "e0000000-0000-4000-8000-000000000003";
const R_ANON = "e0000000-0000-4000-8000-000000000004";
const R_STRANGER = "e0000000-0000-4000-8000-000000000006";
const JESS = "11111111-1111-4111-8111-111111111111";

let db: FakeDb;
let admin: SupabaseClient;

beforeEach(() => {
  db = {
    customers: [
      { id: JANE, first_name: "Jane", last_name: "Tan", email: "jane@x.test" },
      { id: BOB_LEE, first_name: "Bob", last_name: "Lee", email: "bob@x.test" },
      { id: BOB_ONG, first_name: "Bob", last_name: "Ong", email: "bobby@x.test" },
    ],
    mp_staff: [{ id: JESS, name: "Jess" }],
    google_reviews: [
      { id: R_JANE, star_rating: 5, comment: "Great pillow, slept well.", reviewer_name: "Jane T.", review_created_at: "2026-11-03T02:00:00.000Z", status: "pending" },
      { id: R_BOB, star_rating: 3, comment: "Ok", reviewer_name: "Bob", review_created_at: "2026-11-02T02:00:00.000Z", status: "posted", google_reply: "Thanks" },
      { id: R_ANON, star_rating: 1, comment: "Bad", reviewer_name: "Jane", reviewer_is_anonymous: true, review_created_at: "2026-11-04T02:00:00.000Z", status: "pending" },
      { id: R_STRANGER, star_rating: 4, comment: null, reviewer_name: "Walk In", review_created_at: "2026-10-01T02:00:00.000Z", status: "backlog" },
    ],
    // What the SQL returns before its flags: the windows and the shared-token prefilter applied.
    match_candidates: [
      { google_review_id: R_JANE, customer_id: JANE, first_name: "Jane", last_name: "Tan", email: "jane@x.test", asked_at: "2026-10-25T02:00:00.000Z", clicked_at: "2026-11-02T02:00:00.000Z", delivered_at: null },
      { google_review_id: R_BOB, customer_id: BOB_LEE, first_name: "Bob", last_name: "Lee", email: "bob@x.test", asked_at: null, clicked_at: null, delivered_at: "2026-10-13T02:00:00.000Z" },
      { google_review_id: R_BOB, customer_id: BOB_ONG, first_name: "Bob", last_name: "Ong", email: "bobby@x.test", asked_at: null, clicked_at: null, delivered_at: "2026-10-13T02:00:00.000Z" },
    ],
    customer_google_reviews: [],
    customer_google_review_rejections: [],
    product_reviews: [],
    products: [],
    customer_review_requests: [],
    customer_emails: [],
    customer_whatsapp: [],
  };
  admin = fakeReviewsAdmin(db) as unknown as SupabaseClient;
});

describe("Google reviews to match", () => {
  it("lists only reviews with a suggestion: Jane's, not the Bobs' (shared first name), the anonymous one or the stranger's", async () => {
    const list = await listReviewsToMatch(admin);
    expect(list.map((m) => m.review.id)).toEqual([R_JANE]);
    expect(list[0]).toEqual({
      review: {
        id: R_JANE,
        rating: 5,
        reviewerName: "Jane T.",
        reviewedAt: "2026-11-03T02:00:00.000Z",
        excerpt: "Great pillow, slept well.",
        reply: "waiting",
      },
      suggestions: [
        {
          customerId: JANE,
          name: "Jane Tan",
          email: "jane@x.test",
          reason: "first name and initial; asked 9 days before; link clicked 1 day before",
        },
      ],
    });
    expect(await countReviewsToMatch(admin)).toBe(1);
    // The daily Telegram update counts the same list.
    expect(await countGoogleReviewsToMatch(admin)).toBe(1);
  });

  it("drops a review from the list once it is linked, and a suggestion once it is rejected", async () => {
    await rejectGoogleReviewMatch(admin, { reviewId: R_JANE, customerId: JANE, profileId: JESS });
    expect(await countReviewsToMatch(admin)).toBe(0);
    expect(db.customer_google_review_rejections).toEqual([
      expect.objectContaining({ google_review_id: R_JANE, customer_id: JANE, rejected_by_profile_id: JESS }),
    ]);
    // Linking the rejected pair by hand clears the rejection.
    expect(await linkGoogleReview(admin, { reviewId: R_JANE, customerId: JANE, how: "manual", profileId: null })).toMatchObject({ ok: true });
    expect(db.customer_google_review_rejections).toEqual([]);
    expect(await suggestionsForReview(admin, R_JANE)).toEqual([]);
  });

  it("pages the Reviews tab, and lists every unlinked review newest first with its suggestions", async () => {
    const toMatch = await readReviewTab(admin, { scope: "to-match", page: 1 });
    expect(toMatch).toMatchObject({ scope: "to-match", total: 1, counts: { toMatch: 1, unlinked: 4 } });
    const all = await readReviewTab(admin, { scope: "unlinked", page: 1, limit: 3 });
    expect(all.rows.map((r) => [r.review.id, r.suggestions.length])).toEqual([
      [R_ANON, 0],
      [R_JANE, 1],
      [R_BOB, 0],
    ]);
    expect(all.rows[0].review.reviewerName).toBeNull(); // anonymous: never named
    expect(all.rows[2].review.reply).toBe("replied");
    const second = await readReviewTab(admin, { scope: "unlinked", page: 2, limit: 3 });
    expect(second.rows.map((r) => r.review.id)).toEqual([R_STRANGER]);
    expect(second.total).toBe(4);
  });
});

describe("linking", () => {
  it("links a review to at most one Customer, and shows who holds it when asked again", async () => {
    const first = await linkGoogleReview(admin, { reviewId: R_BOB, customerId: BOB_LEE, how: "manual", profileId: JESS });
    expect(first).toEqual({ ok: true, link: { customerId: BOB_LEE, how: "manual", linkedAt: "2026-11-05T02:00:00.000Z" } });
    const second = await linkGoogleReview(admin, { reviewId: R_BOB, customerId: BOB_ONG, how: "manual", profileId: null });
    expect(second).toEqual({
      ok: false,
      reason: "already_linked",
      current: { customerId: BOB_LEE, name: "Bob Lee", email: "bob@x.test", linkedAt: "2026-11-05T02:00:00.000Z" },
    });
    expect(db.customer_google_reviews).toHaveLength(1);
  });

  it("refuses an unknown review or customer", async () => {
    expect(
      await linkGoogleReview(admin, { reviewId: R_BOB, customerId: "c0000000-0000-4000-8000-0000000000ff", how: "manual", profileId: null }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("unlinks only the link that exists, and records the pair as not them", async () => {
    await linkGoogleReview(admin, { reviewId: R_JANE, customerId: JANE, how: "suggestion", profileId: JESS });
    expect(await rejectGoogleReviewMatch(admin, { reviewId: R_JANE, customerId: JANE, profileId: null })).toBe("linked");
    expect(await unlinkGoogleReview(admin, { reviewId: R_JANE, customerId: BOB_LEE, profileId: null })).toBe(false);
    expect(await unlinkGoogleReview(admin, { reviewId: R_JANE, customerId: JANE, profileId: JESS })).toBe(true);
    expect(db.customer_google_reviews).toEqual([]);
    // Not suggested again.
    expect(await suggestionsForReview(admin, R_JANE)).toEqual([]);
  });
});

describe("the Telegram card's line", () => {
  it("links to the Reviews tab while the review has a suggestion, and names nobody", async () => {
    const link = await possibleCustomerMatchLink(admin, R_JANE, "https://mpillow.test");
    expect(link).toBe("https://mpillow.test/settings/customers?view=reviews");
    expect(link).not.toMatch(/jane|tan/i);
    expect(await possibleCustomerMatchLink(admin, R_BOB, "https://mpillow.test")).toBeNull();
    await linkGoogleReview(admin, { reviewId: R_JANE, customerId: JANE, how: "suggestion", profileId: null });
    expect(await possibleCustomerMatchLink(admin, R_JANE, "https://mpillow.test")).toBeNull();
  });

  it("never throws: a read error gives no line", async () => {
    const broken = { rpc: () => { throw new Error("down"); }, from: () => { throw new Error("down"); } } as unknown as SupabaseClient;
    expect(await possibleCustomerMatchLink(broken, R_JANE, "https://mpillow.test")).toBeNull();
  });
});

describe("the Customer's Reviews card", () => {
  beforeEach(() => {
    db.products = [{ id: "p1", slug: "premium-mpillow", content: { "en-US": { title: "Premium Mpillow" } } }];
    db.product_reviews = [
      { id: "s1", product_id: "p1", customer_id: JANE, rating: 4, status: "approved", created_at: "2026-10-28T02:00:00.000Z" },
      { id: "s2", product_id: "p1", customer_id: BOB_LEE, rating: 2, status: "pending", created_at: "2026-10-29T02:00:00.000Z" },
    ];
    db.customer_review_requests = [{ customer_id: JANE, first_clicked_at: "2026-11-02T02:00:00.000Z", click_count: 2 }];
    db.customer_emails = [
      { customer_id: JANE, template: "aftercare.review_request", entity_id: JANE, status: "sent", sent_at: "2026-10-25T02:00:00.000Z" },
    ];
    db.customer_whatsapp = [
      { customer_id: JANE, template: "aftercare.review_request", entity_id: JANE, status: "sent", sent_at: "2026-10-24T02:00:00.000Z" },
    ];
  });

  it("shows a possible Google review before it is linked, then the linked review with who linked it", async () => {
    const before = await readCustomerReviews(admin, JANE);
    expect(before.google).toEqual([]);
    expect(before.possible).toEqual([
      {
        review: expect.objectContaining({ id: R_JANE, rating: 5, reviewerName: "Jane T." }),
        reason: "first name and initial; asked 9 days before; link clicked 1 day before",
      },
    ]);
    expect(before.shop).toEqual([{ id: "s1", rating: 4, product: "Premium Mpillow", status: "approved", createdAt: "2026-10-28T02:00:00.000Z" }]);
    // Asked on is the earlier of the two sends.
    expect(before.request).toEqual({
      askedAt: "2026-10-24T02:00:00.000Z",
      channels: ["email", "whatsapp"],
      clickedAt: "2026-11-02T02:00:00.000Z",
      clickCount: 2,
    });

    await linkGoogleReview(admin, { reviewId: R_JANE, customerId: JANE, how: "suggestion", profileId: JESS });
    const after = await readCustomerReviews(admin, JANE);
    expect(after.possible).toEqual([]);
    expect(after.google).toEqual([
      expect.objectContaining({
        id: R_JANE,
        rating: 5,
        comment: "Great pillow, slept well.",
        reply: "waiting",
        how: "suggestion",
        linkedBy: "Jess",
        linkedAt: "2026-11-05T02:00:00.000Z",
      }),
    ]);
  });

  it("shows nothing suggested for a Customer whose first name is shared, and no request when never asked", async () => {
    const bob = await readCustomerReviews(admin, BOB_LEE);
    expect(bob.possible).toEqual([]);
    expect(bob.request).toBeNull();
    expect(bob.shop.map((s) => s.status)).toEqual(["pending"]);
  });
});

describe("counts", () => {
  it("counts Customers we asked who have a linked Google review", async () => {
    db.admin_customer_overview = [
      { id: "a", review_requested_at: "2026-10-24T02:00:00.000Z", google_reviewed_at: "2026-11-03T02:00:00.000Z" },
      { id: "b", review_requested_at: null, google_reviewed_at: "2026-11-03T02:00:00.000Z" },
      { id: "c", review_requested_at: "2026-10-24T02:00:00.000Z", google_reviewed_at: null },
    ];
    expect(await countLinkedReviewsOfAsked(admin)).toBe(1);
  });

  it("counts reviews linked in a window", async () => {
    db.customer_google_reviews = [
      { google_review_id: R_JANE, customer_id: JANE, linked_at: "2026-11-03T02:00:00.000Z" },
      { google_review_id: R_BOB, customer_id: BOB_LEE, linked_at: "2026-11-10T02:00:00.000Z" },
    ];
    expect(await countGoogleReviewsLinked(admin, { from: "2026-11-01T16:00:00.000Z", to: "2026-11-08T16:00:00.000Z" })).toBe(1);
  });
});

describe("the Review column", () => {
  const cols = {
    review_requested_at: null,
    review_link_clicked_at: null,
    google_review_rating: null,
    google_reviewed_at: null,
    shop_reviews_count: 0,
    shop_review_avg_rating: null,
  };
  it("shows the strongest fact first", () => {
    expect(reviewFacts({ ...cols, google_review_rating: 5, google_reviewed_at: "2026-11-03T02:00:00Z", shop_reviews_count: 2, shop_review_avg_rating: 4.5, review_requested_at: "2026-11-03T02:00:00Z", review_link_clicked_at: "2026-11-04T02:00:00Z" })).toEqual([
      "★5 Google",
      "★5 shop (2)",
      "Asked 3 Nov · clicked",
    ]);
    expect(reviewFacts({ ...cols, shop_reviews_count: 2, shop_review_avg_rating: 4 })).toEqual(["★4 shop (2)"]);
    expect(reviewFacts({ ...cols, review_requested_at: "2026-11-02T17:00:00Z" })).toEqual(["Asked 3 Nov"]);
    expect(reviewFacts(cols)).toEqual([]);
    // Google gave no rating.
    expect(reviewFacts({ ...cols, google_reviewed_at: "2026-11-03T02:00:00Z" })).toEqual(["★– Google"]);
  });
});
