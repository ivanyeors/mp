import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import { DEFAULT_CUSTOMER_FILTERS, parseCustomerFilters, type CustomerListFilters } from "@/lib/crm/customer-filters";
import type { CustomerReviewsData } from "@/lib/crm/reviews";

/**
 * Reviews on every Customer (CRM slice 12), as Staff see them: the Review
 * column and filters on the list, the Reviews tab, and the Reviews card on the
 * Customer detail, with its buttons only for `customers-edit`.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");
const { CustomerFilterGroup } = await import("../customer-filters-panel");

/** One group of the mega filter, as it renders inside the open panel. */
const groupFor = (
  group: "stage" | "purchases" | "reach" | "account" | "reviews",
  filters: Partial<CustomerListFilters>,
  campaigns?: { id: string; name: string }[],
) =>
  renderToString(
    <CustomerFilterGroup
      group={group}
      filters={{ ...DEFAULT_CUSTOMER_FILTERS, ...filters }}
      onChange={() => {}}
      campaigns={campaigns}
    />,
  );
const { CustomersPageTabs } = await import("../customers-page-tabs");
const { CustomerReviewsBody } = await import("../[id]/customer-reviews-card");
const { parseCustomersView } = await import("../views");

const row = (over: Partial<CustomerOverviewRow>): CustomerOverviewRow => ({
  id: "c1",
  email: "ana@x.test",
  first_name: "Ana",
  last_name: "Tan",
  phone: null,
  tags: [],
  total_orders: 1,
  total_spent: 640,
  created_at: "2025-01-01T00:00:00Z",
  has_account: false,
  account_linked_at: null,
  account_last_seen_at: null,
  from_shopify: false,
  created_by_import: null,
  imported_at: null,
  claimed_at: null,
  shopify_orders_count: null,
  shopify_amount_spent: null,
  account_providers: [],
  has_phone: false,
  phone_valid: false,
  claim_link_first_clicked_at: null,
  points_available: 0,
  claim_bonus_at: null,
  open_followups: 0,
  paid_orders: 1,
  first_paid_at: null,
  last_paid_at: null,
  bought: [],
  last_readjusted_at: null,
  search_text: "ana@x.test ana tan",
  marketing_email: "not_subscribed",
  marketing_email_updated_at: null,
  review_requested_at: null,
  review_link_clicked_at: null,
  google_review_rating: null,
  google_reviewed_at: null,
  shop_reviews_count: 0,
  shop_review_avg_rating: null,
  review_rating: null,
  last_campaign_sent_at: null,
  purchases: 0,
  last_purchase_at: null,
  lifecycle_stage: "lead",
  lifecycle_detail: null,
  lifecycle_undated: false,
  attended_bookings: 0,
  pillow_sizes: [],
  last_delivered_at: null,
  lifecycle_statuses: ["lead"],
  ship_country: null,
  locale: "en-US",
  campaigns_sent: [],
  campaigns_clicked: [],
  last_emailed_at: "-infinity",
  unengaged: false,
  ...over,
});

const listFor = (url: string, rows: CustomerOverviewRow[]) => {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(url));
  return renderToString(
    <CustomersClient
      initialData={{ customers: { ok: true, rows, total: rows.length, page: 1, limit: 20 } }}
      initialFilters={filters}
      ignoredFilters={ignored}
    />,
  ).replace(/<!-- -->/g, "");
};

describe("the Review column", () => {
  it("shows the strongest fact first, the rest muted, and — with none", () => {
    const html = listFor("", [
      row({ id: "a", google_review_rating: 5, google_reviewed_at: "2026-11-03T02:00:00Z", shop_reviews_count: 2, shop_review_avg_rating: 4 }),
      row({ id: "b", shop_reviews_count: 2, shop_review_avg_rating: 4 }),
      row({ id: "c", review_requested_at: "2026-11-03T02:00:00Z", review_link_clicked_at: "2026-11-04T02:00:00Z" }),
      row({ id: "d", review_requested_at: "2026-11-03T02:00:00Z" }),
      row({ id: "e" }),
    ]);
    expect(html).toContain(">Review<");
    expect(html).toContain("★5 Google");
    expect(html).toContain("★4 shop (2)");
    expect(html).toContain("Asked 3 Nov · clicked");
    expect(html).toContain("Asked 3 Nov<");
  });

  it("opens a Segment's link with the review filters in the panel, labelled in the summary", () => {
    const html = listFor("google_review=linked&rating=5", [row({})]);
    const reviews = groupFor("reviews", parseCustomerFilters(new URLSearchParams("google_review=linked&rating=5")).filters);
    expect(reviews).toContain('aria-label="Google review"');
    expect(reviews).toContain('aria-label="Shop review"');
    expect(reviews).toContain('aria-label="Rating"');
    expect(html).toContain("Google review linked");
    expect(html).toContain("Rated 5★");
    expect(html).toMatch(/Filters<span[^>]*data-slot="badge"[^>]*>2</);
  });
});

describe("the Reviews tab", () => {
  it("is a view the Telegram update can link to", () => {
    expect(parseCustomersView("reviews")).toBe("reviews");
    const html = renderToString(
      <CustomersPageTabs initialView="reviews" canEdit={false} canEditOnlineResult={false}>
        <p>list</p>
      </CustomersPageTabs>,
    );
    expect(html).toContain(">Reviews<");
    expect(html).toContain("Which Google reviews");
    expect(html).toContain("Nothing is linked until someone taps");
  });
});

const DATA: CustomerReviewsData = {
  ok: true,
  google: [
    {
      id: "g1",
      rating: 5,
      reviewerName: "Jane T.",
      reviewedAt: "2026-11-03T02:00:00.000Z",
      excerpt: "Slept through the night.",
      comment: "Slept through the night.\nThank you.",
      reply: "replied",
      how: "suggestion",
      linkedAt: "2026-11-05T02:00:00.000Z",
      linkedBy: "Jess",
    },
  ],
  shop: [{ id: "s1", rating: 4, product: "Premium Mpillow", status: "pending", createdAt: "2026-10-28T02:00:00.000Z" }],
  request: { askedAt: "2026-10-24T02:00:00.000Z", channels: ["email", "whatsapp"], clickedAt: "2026-11-02T02:00:00.000Z", clickCount: 2 },
  possible: [
    {
      review: { id: "g2", rating: 4, reviewerName: "J. Tan", reviewedAt: "2026-11-04T02:00:00.000Z", excerpt: "Nice", reply: "waiting" },
      reason: "full name; asked 11 days before",
    },
  ],
};

const body = (data: CustomerReviewsData, canEdit: boolean) =>
  renderToString(<CustomerReviewsBody data={data} canEdit={canEdit} />).replace(/<!-- -->/g, "");

describe("the Reviews card", () => {
  it("shows the linked Google review in full, whether we replied, and who linked it", () => {
    const html = body(DATA, true);
    expect(html).toContain("★5");
    expect(html).toContain("Slept through the night.\nThank you.");
    expect(html).toContain("We replied on Google");
    expect(html).toContain("Linked by Jess on 5 Nov 2026.");
    expect(html).toContain("Unlink (not them)");
  });

  it("asks about a possible Google review, with its reason", () => {
    const html = body(DATA, true);
    expect(html).toContain("Possible Google review: <span class=\"font-semibold\">★4</span> by “J. Tan” on 4 Nov: “Nice”");
    expect(html).toContain("full name; asked 11 days before");
    expect(html).toContain("Link?");
    expect(html).toContain("Not them?");
  });

  it("lists shop reviews with their status, and the review request", () => {
    const html = body(DATA, false);
    expect(html).toContain("Premium Mpillow");
    expect(html).toContain("Pending");
    expect(html).toContain("Sent 24 Oct 2026 by email and WhatsApp · link clicked 2 Nov 2026 (2 times)");
  });

  it("shows no button to a view-only role", () => {
    const html = body(DATA, false);
    expect(html).not.toContain("Unlink");
    expect(html).not.toContain("Link?");
    expect(html).not.toContain("Not them?");
  });

  it("says when there is nothing yet", () => {
    const html = body({ ok: true, google: [], shop: [], request: null, possible: [] }, true);
    expect(html).toContain("No Google review linked.");
    expect(html).toContain("No shop reviews.");
    expect(html).toContain("Not asked.");
    expect(body({ ...DATA, request: { ...DATA.request!, clickedAt: null, clickCount: 0 } }, true)).toContain("· not clicked");
  });
});
