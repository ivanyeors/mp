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
  welcome_voucher_state: "none",
  open_followups: 0,
  paid_orders: 1,
  first_paid_at: "2025-03-04T02:00:00Z",
  last_paid_at: "2025-03-04T02:00:00Z",
  bought: ["premium"],
  last_readjusted_at: null,
  search_text: "ana@x.test ana tan",
  marketing_email: "not_subscribed",
  marketing_email_updated_at: null,
  last_campaign_sent_at: null,
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

  it("puts migration slice 06's Voucher filter in the panel, and labels it in the summary", () => {
    const html = listFor("voucher=issued");
    expect(html).toContain('id="customer-filters-panel"');
    expect(html).toContain('aria-label="Voucher"');
    expect(html).toContain("Voucher issued, unused");
    expect(listFor("")).not.toContain('aria-label="Voucher"');
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
