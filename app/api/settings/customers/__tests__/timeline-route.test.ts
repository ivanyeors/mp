import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 03: the Customer timeline route. One fixture Customer with an order and
 * its emails, a guest Result matched by email in another case and padded, a
 * Paired build, a booking, a return, a review and notes. Every event shows, in
 * order, each kind only to a role holding its source's permission, and no
 * Result of another Customer whose email merely contains this one's. Since the
 * merges with CRM 13 and migrations 05 and 12, also aftercare switches and the
 * account (imported, signed up, Claimed, Welcome-back voucher), since
 * migration 06 the Claim links a campaign email carried, by first click,
 * since CRM 06 follow-ups (added, done), since CRM 12 a Linked Google review
 * at its own date, and since migration 08 the campaign emails sent, bounced
 * and complained about.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, identity: null as { id: string; email: string } | null }));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const route = await import("../[id]/timeline/route");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";
const NOBODY = "aaaaaaaa-0000-4000-8000-0000000000ff";
const O1 = "0e000000-0000-4000-8000-000000000001";
const O2 = "0e000000-0000-4000-8000-000000000002";
const GUEST = "0f000000-0000-4000-8000-000000000001"; // guest Result, matched by email
const ANCHOR = "0f000000-0000-4000-8000-000000000002"; // Paired build: the Mpillow
const COMPANION = "0f000000-0000-4000-8000-000000000003"; // Paired build: the Mbolster
const DECLINED = "0f000000-0000-4000-8000-000000000004";
const CANCELLED = "0f000000-0000-4000-8000-000000000005";
const DRAFT = "0f000000-0000-4000-8000-000000000006";
const KIMS = "0f000000-0000-4000-8000-000000000007"; // xmei@x.test: someone else's
const KIMS_SG = "0f000000-0000-4000-8000-000000000008"; // mei@x.test.sg: someone else's
const BOOKING = "0b000000-0000-4000-8000-000000000001";
const RMA = "0c000000-0000-4000-8000-000000000001";
const REVIEW = "0d000000-0000-4000-8000-000000000001";
const G_REVIEW = "0d000000-0000-4000-8000-0000000000a1"; // a Linked Google review (CRM 12)
const NOTE = "0a000000-0000-4000-8000-000000000001";
const LEGACY_NOTE = "0a000000-0000-4000-8000-000000000002";
const VOUCHER = "0c000000-0000-4000-8000-0000000000a1";

const OWNER = "00000000-0000-4000-8000-0000000000b1";
const NO_ORDERS = "00000000-0000-4000-8000-0000000000b2";
const NO_RESULTS = "00000000-0000-4000-8000-0000000000b3";
const CRM_ONLY = "00000000-0000-4000-8000-0000000000b4";
const ORDERS_ONLY = "00000000-0000-4000-8000-0000000000b5";
const JESS = "11111111-1111-4111-8111-111111111111";
const KAI = "11111111-1111-4111-8111-222222222222";
const FOLLOW_UP = "0e000000-0000-4000-8000-0000000000f1";
const OPEN_FOLLOW_UP = "0e000000-0000-4000-8000-0000000000f2";

const t = (s: string) => `2026-${s}:00Z`;

const result = (row: Record<string, unknown>) => ({
  status: "assigned",
  product_type: "pillow",
  suggested_size: null,
  suggested_tier: null,
  suggested_length: null,
  assigned_size: null,
  assigned_tier: null,
  assigned_length: null,
  customer_id: null,
  customer_email: null,
  paired_build_id: null,
  assigned_at: null,
  topup_paid_at: null,
  ...row,
});

beforeEach(() => {
  h.db = {
    admin_roles: [
      { id: "r-owner", key: "owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-no-orders", key: "no-orders", name: "No orders", grants_all: false, permissions: ["customers", "results", "appointments", "returns"] },
      { id: "r-no-results", key: "no-results", name: "No results", grants_all: false, permissions: ["customers", "orders", "appointments", "returns"] },
      { id: "r-crm", key: "crm", name: "CRM", grants_all: false, permissions: ["customers"] },
      { id: "r-orders", key: "orders-only", name: "Orders only", grants_all: false, permissions: ["orders"] },
    ],
    admin_users: [
      { id: OWNER, email: "owner@x.test", role_id: "r-owner", is_active: true, auth_user_id: "auth-owner" },
      { id: NO_ORDERS, email: "a@x.test", role_id: "r-no-orders", is_active: true, auth_user_id: "auth-a" },
      { id: NO_RESULTS, email: "b@x.test", role_id: "r-no-results", is_active: true, auth_user_id: "auth-b" },
      { id: CRM_ONLY, email: "c@x.test", role_id: "r-crm", is_active: true, auth_user_id: "auth-c" },
      { id: ORDERS_ONLY, email: "d@x.test", role_id: "r-orders", is_active: true, auth_user_id: "auth-d" },
    ],
    mp_staff: [
      { id: JESS, name: "Jess", admin_user_id: OWNER, archived_at: null },
      { id: KAI, name: "Kai", admin_user_id: OWNER, archived_at: null },
    ],
    customers: [
      // Migration 12: when the current login was bound. Kim has no account.
      { id: MEI, email: "mei@x.test", first_name: "Mei", account_linked_at: t("06-14T23:59") },
      { id: KIM, email: "kim@x.test", first_name: "Kim", account_linked_at: null },
    ],
    orders: [
      {
        id: O1, customer_id: MEI, order_number: "1001", status: "delivered", total: 480, currency: "SGD",
        created_at: t("09-01T02:00"), paid_at: t("09-01T02:05"), shipped_at: t("09-03T03:00"),
        delivered_at: t("09-05T04:00"), cancelled_at: null, refund_requested_at: null,
      },
      {
        id: O2, customer_id: KIM, order_number: "1002", status: "confirmed", total: 90, currency: "SGD",
        created_at: t("09-02T02:00"), paid_at: t("09-02T02:01"), shipped_at: null,
        delivered_at: null, cancelled_at: null, refund_requested_at: null,
      },
    ],
    order_emails: [
      { id: "em-1", order_id: O1, template: "order_confirmation", status: "sent", created_at: t("09-01T02:06") },
      { id: "em-2", order_id: O1, template: "shipping", status: "failed", created_at: t("09-03T03:01") },
      { id: "em-3", order_id: O2, template: "order_confirmation", status: "sent", created_at: t("09-02T02:02") },
    ],
    mp_config_responses: [
      // A guest Result: no customer_id, the email in another case and padded.
      result({ id: GUEST, customer_email: "  MEI@X.Test ", assigned_size: "M", assigned_tier: "premium", created_at: t("08-20T01:00"), assigned_at: t("08-22T01:00") }),
      // A Paired build: two Results, one entry per fact.
      result({ id: ANCHOR, customer_id: MEI, customer_email: "mei@x.test", paired_build_id: ANCHOR, suggested_size: "L", suggested_tier: "basic", created_at: t("07-01T00:00"), assigned_at: t("07-02T00:00"), topup_paid_at: t("07-04T00:00") }),
      result({ id: COMPANION, customer_id: MEI, customer_email: "mei@x.test", paired_build_id: ANCHOR, product_type: "bolster", assigned_length: "90", created_at: t("07-01T00:05"), assigned_at: t("07-03T00:00") }),
      // Declined and cancelled: no time of their own, so only their created entry, with the status pill.
      result({ id: DECLINED, customer_id: MEI, status: "declined", created_at: t("06-01T00:00") }),
      result({ id: CANCELLED, customer_id: MEI, status: "cancelled", created_at: t("05-01T00:00") }),
      result({ id: DRAFT, customer_id: MEI, status: null, created_at: t("09-15T00:00") }),
      // Someone else's, with an email that merely contains Mei's, or that Mei's is a prefix of.
      result({ id: KIMS, customer_id: KIM, customer_email: "xmei@x.test", created_at: t("09-12T00:00") }),
      result({ id: KIMS_SG, customer_id: null, customer_email: "mei@x.test.sg", created_at: t("09-13T00:00") }),
    ],
    readjustment_bookings: [
      {
        id: BOOKING, customer_id: MEI, status: "attended", product_label: "Premium Mpillow M",
        location_name: "Bukit Timah", start_at: t("09-20T02:00"), complimentary: true, created_at: t("09-10T02:00"),
      },
    ],
    admin_audit_log: [
      { id: "au-1", action: "result.cancel", entity_type: "mp_config_response", entity_id: CANCELLED, created_at: t("05-02T00:00") },
      { id: "au-2", action: "readjustment.attended", entity_type: "readjustment_booking", entity_id: BOOKING, created_at: t("09-20T03:00") },
      // Someone else's Result: never read.
      { id: "au-3", action: "result.cancel", entity_type: "mp_config_response", entity_id: KIMS, created_at: t("09-14T00:00") },
    ],
    rma_requests: [
      { id: RMA, order_id: O1, customer_id: MEI, resolution: "exchange", status: "approved", created_at: t("09-08T02:00") },
    ],
    rma_status_events: [
      { id: "ev-1", rma_request_id: RMA, from_status: null, to_status: "requested", actor: "system", created_at: t("09-08T02:00") },
      { id: "ev-2", rma_request_id: RMA, from_status: "requested", to_status: "approved", actor: "staff", created_at: t("09-09T02:00") },
    ],
    products: [{ id: "p-1", slug: "mpillow", content: { "en-US": { title: "Mpillow" } } }],
    product_reviews: [
      { id: REVIEW, product_id: "p-1", customer_id: MEI, rating: 5, status: "approved", created_at: t("09-06T02:00") },
    ],
    customer_notes: [
      { id: NOTE, customer_id: MEI, body: "Prefers a firm fill.", author_profile_id: JESS, author_user_id: "auth-owner", created_at: t("09-30T02:00"), deleted_at: null },
      { id: LEGACY_NOTE, customer_id: MEI, body: "old box", author_profile_id: null, author_user_id: null, created_at: t("04-01T00:00"), deleted_at: null },
      { id: "gone", customer_id: MEI, body: "Deleted", author_profile_id: JESS, author_user_id: "auth-owner", created_at: t("09-25T00:00"), deleted_at: t("09-26T00:00") },
    ],
    // CRM 13: every switch change is an event.
    // CRM 06: one follow-up added and done, one still open, and one of Kim's.
    customer_followups: [
      { id: FOLLOW_UP, customer_id: MEI, title: "Call about her second pillow", due_on: "2026-09-29", assigned_to_profile_id: JESS, created_by_profile_id: KAI, created_at: t("09-27T02:00"), done_at: t("09-29T03:00"), done_by_profile_id: JESS },
      { id: OPEN_FOLLOW_UP, customer_id: MEI, title: "Send the fill sample", due_on: "2026-10-30", assigned_to_profile_id: KAI, created_by_profile_id: null, created_at: t("09-28T02:00"), done_at: null, done_by_profile_id: null },
      { id: "fu-kim", customer_id: KIM, title: "Kim's", due_on: "2026-10-30", assigned_to_profile_id: KAI, created_by_profile_id: null, created_at: t("09-28T03:00"), done_at: null, done_by_profile_id: null },
    ],
    customer_preference_events: [
      { id: 1, customer_id: MEI, preference: "aftercare_whatsapp", to_value: true, source: "staff", changed_by_profile_id: JESS, note: "Agreed on the phone.", wording: null, created_at: t("09-25T05:00") },
      { id: 2, customer_id: MEI, preference: "aftercare_email", to_value: false, source: "profile", changed_by_profile_id: null, note: null, wording: null, created_at: t("08-25T00:00") },
      { id: 3, customer_id: KIM, preference: "aftercare_email", to_value: false, source: "profile", changed_by_profile_id: null, note: null, wording: null, created_at: t("08-26T00:00") },
    ],
    // Migration 07: Shopify's yes, dated the export day (before the import), then the link.
    customer_consent_events: [
      { id: 1, customer_id: MEI, channel: "email", from_state: "not_subscribed", to_state: "subscribed", source: "shopify_import", created_at: t("02-27T16:00") },
      { id: 2, customer_id: MEI, channel: "email", from_state: "subscribed", to_state: "unsubscribed", source: "unsubscribe_link", created_at: t("09-28T01:00") },
      { id: 3, customer_id: KIM, channel: "email", from_state: "not_subscribed", to_state: "subscribed", source: "account", created_at: t("09-27T00:00") },
    ],
    // CRM 07: asked for a Google review once, by both channels, and the link opened twice.
    customer_review_requests: [
      { customer_id: MEI, order_id: O1, token_hash: "h-mei", created_at: t("09-15T02:00"), first_clicked_at: t("09-16T03:00"), click_count: 2 },
    ],
    customer_emails: [
      { id: 1, customer_id: MEI, template: "aftercare.review_request", entity_id: MEI, status: "sent", sent_at: t("09-15T02:00") },
    ],
    customer_whatsapp: [
      { id: 1, customer_id: MEI, template: "aftercare.review_request", entity_id: MEI, status: "sent", sent_at: t("09-15T02:01") },
    ],
    // CRM 12: Mei's Google review, linked by Staff weeks after she wrote it; Kim's; and one nobody linked.
    google_reviews: [
      { id: G_REVIEW, star_rating: 5, comment: "Slept through the night.", review_created_at: t("09-18T02:00"), created_at: t("09-18T03:00"), status: "posted", google_reply: "Thank you, Mei!" },
      { id: "g-kim", star_rating: 2, comment: "Too firm.", review_created_at: t("09-19T02:00"), created_at: t("09-19T03:00"), status: "pending", google_reply: null },
      { id: "g-nobody", star_rating: 4, comment: "Nice.", review_created_at: t("09-21T02:00"), created_at: t("09-21T03:00"), status: "pending", google_reply: null },
    ],
    customer_google_reviews: [
      { google_review_id: G_REVIEW, customer_id: MEI, how: "suggestion", linked_by_profile_id: JESS, linked_at: t("10-01T00:00") },
      { google_review_id: "g-kim", customer_id: KIM, how: "manual", linked_by_profile_id: null, linked_at: t("10-01T00:00") },
    ],
    // Migration 02 and 05: imported, Claimed, and the voucher the Claim issued in the same transaction.
    migrated_customers: [
      { customer_id: MEI, created_by_import: false, imported_at: t("03-01T00:00"), claimed_at: t("06-15T00:00") },
      { customer_id: KIM, created_by_import: true, imported_at: t("03-01T00:00"), claimed_at: null },
    ],
    // Migration 06: the announcement's link opened twice, the reminder's never;
    // Kim's link is Kim's alone.
    customer_claim_links: [
      { id: 1, customer_id: MEI, token_hash: "h-1", template: "migration_announcement", created_at: t("06-10T00:00"), first_clicked_at: t("06-14T12:00"), click_count: 2 },
      { id: 2, customer_id: MEI, token_hash: "h-2", template: "migration_reminder", created_at: t("06-12T00:00"), first_clicked_at: null, click_count: 0 },
      { id: 3, customer_id: KIM, token_hash: "h-3", template: "migration_announcement", created_at: t("06-10T00:00"), first_clicked_at: t("06-11T00:00"), click_count: 1 },
    ],
    // Migration 08: the announcement sent, the reminder sent and then bounced,
    // and a service notice that failed (it reached nobody, so it is not shown).
    // Kim's complaint is Kim's alone.
    customer_campaign_sends: [
      { id: "cs-1", customer_id: MEI, template: "migration_announcement", wave: "w1", status: "sent", provider_message_id: "re_1", sent_at: t("06-10T00:05"), bounced_at: null, complained_at: null },
      { id: "cs-2", customer_id: MEI, template: "migration_reminder", wave: "r1", status: "bounced", provider_message_id: "re_2", sent_at: t("06-12T00:05"), bounced_at: t("06-12T01:00"), complained_at: null },
      { id: "cs-3", customer_id: MEI, template: "migration_service_notice", wave: "n1", status: "failed", provider_message_id: null, sent_at: t("06-13T00:00"), bounced_at: null, complained_at: null },
      { id: "cs-k", customer_id: KIM, template: "migration_announcement", wave: "w1", status: "complained", provider_message_id: "re_k", sent_at: t("06-10T00:06"), bounced_at: null, complained_at: t("06-10T09:00") },
    ],
    coupons: [
      { id: VOUCHER, code: "WB-SECRETCODE", customer_id: MEI, issued_for: "welcome_back", is_active: true, usage_limit: 1, usage_count: 1, expires_at: t("08-14T00:00"), created_at: t("06-15T00:00") },
      { id: "coupon-kim", code: "WB-KIMS", customer_id: KIM, issued_for: "welcome_back", is_active: true, usage_limit: 1, usage_count: 0, expires_at: null, created_at: t("06-16T00:00") },
    ],
  };
});

const signIn = (memberId: string | null) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
};

type Entry = { id: string; kind: string; group: string; summary: string; status?: string; detail?: string; ref: { href?: string } };

const get = (id: string, query = "") =>
  route.GET(new Request(`https://x.test/api/settings/customers/${id}/timeline${query}`), { params: Promise.resolve({ id }) });

async function page(id = MEI, query = "") {
  const res = await get(id, query);
  expect(res.status).toBe(200);
  return (await res.json()) as { entries: Entry[]; next: string | null; groups: { key: string }[]; unavailable: string[] };
}

/** Every event on Mei's timeline, newest first, for a role that holds every key. */
const EVERYTHING = [
  `note.added:${NOTE}`,
  `follow_up.done:${FOLLOW_UP}`,
  `follow_up.added:${OPEN_FOLLOW_UP}`,
  "consent.unsubscribed:2",
  `follow_up.added:${FOLLOW_UP}`,
  "aftercare.turned_on:1",
  "readjustment.attended:au-2",
  // At the review's own date, not the day Staff linked it.
  `google_review.written:${G_REVIEW}`,
  `review_request.clicked:${MEI}`,
  `review_request.sent:${MEI}`,
  `readjustment.booked:${BOOKING}`,
  "return.status_changed:ev-2",
  `return.opened:${RMA}`,
  `review.submitted:${REVIEW}`,
  `order.delivered:${O1}`,
  `order.shipped:${O1}`,
  "order.email_sent:em-1",
  `order.paid:${O1}`,
  `order.placed:${O1}`,
  "aftercare.turned_off:2",
  `result.build_sent:${GUEST}`,
  `result.created:${GUEST}`,
  `result.balance_paid:${ANCHOR}`,
  `result.build_sent:${ANCHOR}`,
  `result.created:${ANCHOR}`,
  // Same instant (one transaction): ties go by kind.
  `account.claimed:${MEI}`,
  `account.voucher_issued:${VOUCHER}`,
  `account.signed_up:${MEI}`,
  "claim_link.opened:1",
  "campaign_email.bounced:cs-2",
  "campaign_email.sent:cs-2",
  "campaign_email.sent:cs-1",
  `result.created:${DECLINED}`,
  "result.cancelled:au-1",
  `result.created:${CANCELLED}`,
  `note.added:${LEGACY_NOTE}`,
  `account.imported:${MEI}`,
  "consent.subscribed:1",
];

describe("GET /api/settings/customers/[id]/timeline", () => {
  it("shows every event of the fixture Customer, newest first", async () => {
    signIn(OWNER);
    const body = await page();
    expect(body.entries.map((e) => e.id)).toEqual(EVERYTHING);
    expect(body.next).toBeNull();
    expect(body.unavailable).toEqual([]);
    expect(body.groups.map((g) => g.key)).toEqual([
      "orders", "results", "readjustments", "returns", "reviews", "aftercare", "marketing", "account", "notes", "followups",
    ]);
  });

  it("says what happened in one line, links what has a page, and keeps a note in full", async () => {
    signIn(OWNER);
    const byId = new Map((await page()).entries.map((e) => [e.id, e]));
    expect(byId.get(`order.placed:${O1}`)).toMatchObject({ summary: "Order #1001 placed · $480.00", status: "delivered", ref: { href: `/settings/orders/${O1}` } });
    expect(byId.get("order.email_sent:em-1")?.summary).toBe("Email sent: Order confirmed (order #1001)");
    expect(byId.get(`result.created:${GUEST}`)).toMatchObject({ summary: "Result created: Mpillow M · Premium", status: "assigned", ref: { href: `/settings/results/${GUEST}` } });
    expect(byId.get(`readjustment.booked:${BOOKING}`)).toMatchObject({ status: "attended", ref: { href: "/settings/appointments" } });
    expect(byId.get(`readjustment.booked:${BOOKING}`)?.summary).toContain("Premium Mpillow M at Bukit Timah");
    expect(byId.get("return.status_changed:ev-2")).toMatchObject({ summary: "Return approved by Staff", ref: { href: `/settings/rma/${RMA}` } });
    expect(byId.get(`return.opened:${RMA}`)?.summary).toBe("Return opened on order #1001 (exchange)");
    expect(byId.get(`review.submitted:${REVIEW}`)).toMatchObject({ summary: "Shop review: 5★ on Mpillow", status: "approved" });
    expect(byId.get(`review_request.sent:${MEI}`)?.summary).toBe("Review requested (email, WhatsApp)");
    expect(byId.get(`review_request.clicked:${MEI}`)?.summary).toBe("Review link clicked (2 times)");
    // CRM 12: the stars and whether we replied; the text stays on the Reviews card.
    expect(byId.get(`google_review.written:${G_REVIEW}`)).toMatchObject({
      summary: "Google review: 5★",
      status: "We replied on Google",
      group: "reviews",
    });
    expect(JSON.stringify(byId.get(`google_review.written:${G_REVIEW}`))).not.toContain("Slept");
    expect(byId.get(`note.added:${NOTE}`)).toMatchObject({ summary: "Note by Jess", detail: "Prefers a firm fill." });
    expect(byId.get(`note.added:${LEGACY_NOTE}`)?.summary).toMatch(/^Notes before /);
    expect(byId.get(`follow_up.added:${FOLLOW_UP}`)).toMatchObject({
      summary: "Follow-up for Jess, due 29 Sept 2026, added by Kai",
      status: "done",
      detail: "Call about her second pillow",
    });
    expect(byId.get(`follow_up.added:${OPEN_FOLLOW_UP}`)).toMatchObject({ summary: "Follow-up for Kai, due 30 Oct 2026", status: "open" });
    expect(byId.get(`follow_up.done:${FOLLOW_UP}`)).toMatchObject({ summary: "Follow-up done by Jess", detail: "Call about her second pillow" });
    expect(byId.get(`follow_up.added:${FOLLOW_UP}`)?.ref.href).toBeUndefined();
    expect(byId.get("aftercare.turned_on:1")).toMatchObject({ summary: "Aftercare WhatsApp turned on by Jess", detail: "Agreed on the phone." });
    expect(byId.get("aftercare.turned_off:2")?.summary).toBe("Aftercare email turned off by the customer");
    expect(byId.get("consent.subscribed:1")?.summary).toBe("Subscribed to marketing email from the Shopify export");
    expect(byId.get("consent.unsubscribed:2")?.summary).toBe(
      "Unsubscribed from marketing email by the unsubscribe link in an email",
    );
    expect(byId.has("consent.subscribed:3")).toBe(false);
    expect(byId.get(`account.imported:${MEI}`)?.summary).toBe("Imported from Shopify, matched to this Customer");
    expect(byId.get(`account.claimed:${MEI}`)?.summary).toBe("Claimed: first sign-in since the import");
    expect(byId.get(`account.signed_up:${MEI}`)?.summary).toBe("Signed up: a login was linked to this Customer");
    // A coupon stores no time it was used: that is its pill. Its code is never shown.
    expect(byId.get(`account.voucher_issued:${VOUCHER}`)).toMatchObject({ summary: "Welcome-back voucher issued", status: "used" });
    // Only the first click is dated; the count is in the line. The token is never read.
    expect(byId.get("claim_link.opened:1")).toMatchObject({ summary: "Claim link opened (announcement email, 2 times)", group: "account" });
    expect(JSON.stringify(byId.get("claim_link.opened:1"))).not.toContain("h-1");
    // Migration 08: each send the provider took, with its status; its bounce, dated.
    expect(byId.get("campaign_email.sent:cs-1")).toMatchObject({
      summary: "Campaign email sent: Account announcement (wave w1)",
      status: "sent",
      group: "marketing",
    });
    expect(byId.get("campaign_email.sent:cs-2")).toMatchObject({ summary: "Campaign email sent: Account reminder (wave r1)", status: "bounced" });
    expect(byId.get("campaign_email.bounced:cs-2")?.summary).toBe("Campaign email bounced: Account reminder. Left out of later waves");
    expect([...byId.keys()].some((k) => k.endsWith("cs-3"))).toBe(false);
    for (const e of byId.values()) expect(JSON.stringify(e)).not.toContain("WB-SECRETCODE");
    // No customer email in any line.
    for (const e of byId.values()) expect(e.summary.toLowerCase()).not.toContain("mei@x.test");
  });

  it("shows a Paired build as one entry per fact, with both statuses", async () => {
    signIn(OWNER);
    const pair = (await page()).entries.filter((e) => e.id.endsWith(ANCHOR) || e.id.endsWith(COMPANION));
    expect(pair.map((e) => e.kind)).toEqual(["result.balance_paid", "result.build_sent", "result.created"]);
    expect(pair[2]).toMatchObject({ summary: "Paired build created: Mpillow L · Basic + Mbolster 90", status: "assigned" });
  });

  it("invents no dates: a declined Result and a cancelled one carry their status, not a dated step", async () => {
    signIn(OWNER);
    const entries = (await page()).entries;
    expect(entries.find((e) => e.id === `result.created:${DECLINED}`)?.status).toBe("declined");
    expect(entries.filter((e) => e.id.endsWith(DECLINED))).toHaveLength(1);
    // The cancel is dated by the audit entry Staff's cancel wrote, nothing else.
    expect(entries.find((e) => e.id === "result.cancelled:au-1")?.summary).toBe("Cancelled by Staff: Mpillow");
    expect(entries.some((e) => e.kind === "result.declined" || e.kind === "result.expired")).toBe(false);
  });

  it("never shows a Result of another Customer whose email merely contains this one's", async () => {
    signIn(OWNER);
    const ids = (await page()).entries.map((e) => e.id).join(" ");
    for (const other of [KIMS, KIMS_SG, DRAFT, "au-3"]) expect(ids).not.toContain(other);
    // Kim's own timeline has their Result, and none of Mei's.
    const kim = (await page(KIM)).entries.map((e) => e.id);
    expect(kim).toContain(`result.created:${KIMS}`);
    expect(kim.join(" ")).not.toContain(GUEST);
  });

  it("hides every order and order-email entry from a role without orders", async () => {
    signIn(NO_ORDERS);
    const body = await page();
    expect(body.entries.map((e) => e.id)).toEqual(EVERYTHING.filter((id) => !id.startsWith("order.")));
    expect(body.groups.map((g) => g.key)).not.toContain("orders");
  });

  it("hides every Result entry from a role without results", async () => {
    signIn(NO_RESULTS);
    const body = await page();
    expect(body.entries.map((e) => e.id)).toEqual(EVERYTHING.filter((id) => !id.startsWith("result.")));
    expect(body.groups.map((g) => g.key)).not.toContain("results");
  });

  it("shows a customers-only role the Customer's own facts: reviews, review requests, aftercare, consent, account and notes", async () => {
    signIn(CRM_ONLY);
    const body = await page();
    expect(body.entries.map((e) => e.id)).toEqual(
      EVERYTHING.filter((id) =>
        /^(note|review|google_review|review_request|aftercare|consent|campaign_email|account|claim_link|follow_up)\./.test(id),
      ),
    );
    expect(body.groups.map((g) => g.key)).toEqual(["reviews", "aftercare", "marketing", "account", "notes", "followups"]);
  });

  it("shows a complaint on the Customer who made it, and nowhere else", async () => {
    signIn(OWNER);
    const kim = new Map((await page(KIM)).entries.map((e) => [e.id, e]));
    expect(kim.get("campaign_email.complained:cs-k")?.summary).toBe("Marked as spam: Account announcement");
    expect(kim.get("campaign_email.sent:cs-k")?.status).toBe("complained");
    expect([...kim.keys()].some((k) => /cs-[123]/.test(k))).toBe(false);
  });

  it("narrows to the kind groups asked for, among those the viewer may see", async () => {
    signIn(OWNER);
    expect((await page(MEI, "?kinds=returns,notes")).entries.map((e) => e.id)).toEqual(
      EVERYTHING.filter((id) => id.startsWith("return.") || id.startsWith("note.")),
    );
    signIn(NO_ORDERS);
    expect((await page(MEI, "?kinds=orders")).entries).toEqual([]);
  });

  it("pages through everything with the cursor, each entry once", async () => {
    signIn(OWNER);
    const seen: string[] = [];
    let query = "?limit=3";
    for (let guard = 0; guard < 30; guard++) {
      const body = await page(MEI, query);
      seen.push(...body.entries.map((e) => e.id));
      if (!body.next) break;
      query = `?limit=3&before=${encodeURIComponent(body.next)}`;
    }
    expect(seen).toEqual(EVERYTHING);
  });

  it("needs customers, a Customer that exists, and a cursor it wrote", async () => {
    signIn(null);
    expect((await get(MEI)).status).toBe(401);
    signIn(ORDERS_ONLY);
    expect((await get(MEI)).status).toBe(403);
    signIn(OWNER);
    expect((await get(NOBODY)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get(MEI, "?before=garbage")).status).toBe(400);
  });
});
