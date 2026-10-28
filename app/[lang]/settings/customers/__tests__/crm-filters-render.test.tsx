import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";

/**
 * The Customers list's CRM filters (CRM slice 04): the Filters panel, the
 * active-filter summary with *Clear all*, the *ignored* note, and the *Last
 * order* column. The list opens from a link in the state that link describes.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");

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
  first_paid_at: "2025-03-04T02:00:00Z",
  last_paid_at: "2025-03-04T02:00:00Z",
  bought: ["premium"],
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
  purchases: 2,
  last_purchase_at: "2025-03-04T02:00:00Z",
  lifecycle_stage: "loyal",
  lifecycle_detail: "repeat_purchases",
  lifecycle_undated: false,
  attended_bookings: 0,
  ...over,
});

/** The list as the page renders it for `url`: its filters, and what it dropped. */
const listFor = (url: string, rows: CustomerOverviewRow[] = [row({})]) => {
  const { filters, ignored } = parseCustomerFilters(new URLSearchParams(url));
  return renderToString(
    <CustomersClient
      initialData={{ customers: { ok: true, rows, total: rows.length, page: 1, limit: 20 } }}
      initialFilters={filters}
      ignoredFilters={ignored}
    />,
  );
};

describe("Customers list: CRM filters", () => {
  it("opens a link with its filters in the panel and the summary", () => {
    const html = listFor("bought=premium&last_order=over:12&readjusted=never");
    expect(html).toContain('id="customer-filters-panel"');
    expect(html).toContain('aria-label="Last order"');
    expect(html).toContain('aria-label="Re-adjusted"');
    expect(html).toContain("Bought Premium Mpillow");
    expect(html).toContain("Last order over a year ago");
    expect(html).toContain("Never re-adjusted");
    expect(html).toContain("Clear all");
    // The panel's count: three of its filters are set.
    expect(html).toMatch(/Filters<span[^>]*data-slot="badge"[^>]*>3</);
  });

  it("keeps the panel closed, and shows no summary, for the plain list", () => {
    const html = listFor("");
    expect(html).toContain("Filters");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('id="customer-filters-panel"');
    expect(html).not.toContain("Clear all");
  });

  it("says when a link's filter was ignored, and does not apply it", () => {
    const html = listFor("bought=foo");
    expect(html).toContain("1 filter ignored (bought)");
    expect(html).not.toContain("Clear all");
    expect(listFor("bought=foo&last_order=soon")).toContain("2 filters ignored (bought, last_order)");
  });

  it("shows a search with a comma or a bracket as a filter like any other", () => {
    const html = listFor("search=Tan%2C%20Mei%20(test)");
    expect(html).toContain("Search: “Tan, Mei (test)”");
    expect(html).toContain('value="Tan, Mei (test)"');
  });

  it("adds a Last order column on wide screens", () => {
    const html = listFor("");
    expect(html).toContain(">Last order<");
    expect(html).toContain("4 Mar 2025");
  });

  it("puts the Points filter in the panel, and labels it in the summary (PRD-loyalty-points slice 06)", () => {
    const html = listFor("points=has");
    expect(html).toContain('id="customer-filters-panel"');
    expect(html).toContain('aria-label="Points"');
    expect(html).toContain("Has points");
    expect(listFor("")).not.toContain('aria-label="Points"');
    expect(listFor("points=none")).toContain("No points");
    // The retired voucher filter is gone from the panel.
    expect(html).not.toMatch(/voucher/i);
  });

  it("puts migration slice 07's Email consent filter in the panel, and labels it in the summary", () => {
    const html = listFor("consent=unsubscribed");
    expect(html).toContain('id="customer-filters-panel"');
    expect(html).toContain('aria-label="Email consent"');
    expect(html).toContain("Email unsubscribed");
    expect(html).toContain("Clear all");
    expect(listFor("")).not.toContain('aria-label="Email consent"');
  });

  it("offers the last-order and spend sorts", () => {
    const html = listFor("sort=spend");
    expect(html).toContain("Most spent");
  });
});

// PRD-crm-retention-loop slice 03: the Lifecycle stage.
describe("Customers list: Lifecycle stage", () => {
  it("adds a Stage column, with each stage's sub-status, a Shopify-only buyer's missing dates and when a Lost one unsubscribed", () => {
    const html = listFor("", [
      row({ id: "c1", lifecycle_stage: "at_risk", lifecycle_detail: "lapsed", purchases: 3, last_purchase_at: "2024-03-04T02:00:00Z" }),
      row({ id: "c2", lifecycle_stage: "new", lifecycle_detail: "awaiting_delivery", purchases: 1 }),
      row({ id: "c3", lifecycle_stage: "loyal", lifecycle_detail: "repeat_purchases", purchases: 2, last_purchase_at: null, lifecycle_undated: true }),
      row({ id: "c4", lifecycle_stage: "lost", lifecycle_detail: null, marketing_email: "unsubscribed", marketing_email_updated_at: "2026-09-02T03:00:00Z" }),
    ]);
    expect(html).toContain(">Stage<");
    expect(html).toContain(">At risk<");
    expect(html).toContain('title="At risk: No purchase or attended booking for over 12 months (Lapsed over 24)."');
    expect(html).toContain(">Lapsed<");
    expect(html).toContain("Awaiting delivery");
    expect(html).toContain("Repeat purchases · No dates yet");
    expect(html).toContain(">Lost<");
    expect(html).toContain("Unsubscribed 2 Sept 2026");
    // On phones too, beside the badge in the Name cell, not only in the md+ Stage column.
    const nameCells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]).filter((c) => c.includes("md:hidden"));
    expect(nameCells.some((c) => c.includes("Awaiting delivery"))).toBe(true);
    expect(nameCells.some((c) => c.includes("No dates yet"))).toBe(true);
    expect(nameCells.some((c) => c.includes("Unsubscribed"))).toBe(true);
  });

  it("never gives a Lost buyer the Shopify no-dates note or tooltip", () => {
    const html = listFor("", [
      row({ lifecycle_stage: "lost", lifecycle_detail: null, lifecycle_undated: true, last_purchase_at: null, marketing_email: "unsubscribed", marketing_email_updated_at: "2026-09-02T03:00:00Z" }),
    ]);
    expect(html).toContain('title="Lost: Unsubscribed from marketing, with no purchase or attended booking since."');
    expect(html).toContain("Unsubscribed 2 Sept 2026");
    expect(html).not.toContain("No dates yet");
    expect(html).not.toContain("Placed by their Shopify-era order count");
  });

  it("puts each row's cells under their own headers", () => {
    const html = listFor("", [row({ lifecycle_stage: "lost", lifecycle_detail: null, purchases: 3 })]);
    // `<th ` and `<th>`, not `<thead`.
    const headers = [...html.matchAll(/<th[\s>][^>]*>?([^<]*)</g)].map((m) => m[1]);
    const body = html.slice(html.indexOf("<tbody"));
    const cells = [...body.matchAll(/<td[^>]*>/g)].map((m) => m.index!);
    const cellOf = (at: number) => cells.filter((i) => i < at).length - 1;
    expect(cellOf(body.indexOf("ana@x.test</td>"))).toBe(headers.indexOf("Email"));
    // The last badge: the first is the phone layout's, inside the Name cell.
    expect(cellOf(body.lastIndexOf(">Lost<"))).toBe(headers.indexOf("Stage"));
  });

  it("dates Last order by the latest purchase, not by a re-adjustment fee", () => {
    const html = listFor("", [row({ last_paid_at: "2026-10-01T02:00:00Z", last_purchase_at: "2025-03-04T02:00:00Z" })]);
    expect(html).toContain("4 Mar 2025");
    expect(html).not.toContain("1 Oct 2026");
  });

  it("opens a stage link with its boxes ticked and its summary chip", () => {
    const html = listFor("stage=at-risk,lost");
    expect(html).toContain('id="customer-filters-panel"');
    expect(html).toContain("Stage: At risk or Lost");
    expect(html).toMatch(/Filters<span[^>]*data-slot="badge"[^>]*>1</);
    // Each stage box says its rule.
    expect(html).toContain("Unsubscribed from marketing, with no purchase or attended booking since");
    expect(html.match(/role="checkbox" aria-checked="true"/g)?.length).toBe(2);
  });
});
