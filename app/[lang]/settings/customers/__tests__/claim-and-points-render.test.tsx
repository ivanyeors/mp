import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { MigratedCustomerFacts } from "@/lib/customer-migration/overview";
import { DEFAULT_CUSTOMER_FILTERS, type CustomerListFilters } from "@/lib/crm/customer-filters";

/**
 * What the Claim link and the Claim bonus add to the Customers page
 * (migration slice 06; PRD-loyalty-points slice 06, which retired the
 * Welcome-back voucher): the list's Points filter, and the From Shopify
 * card's first click and Claim bonus. (The Migration card, with Points spent
 * and Revenue, left the page on 2026-11-01.)
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
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
const { FromShopifyCard } = await import("../[id]/customer-account-cards");

describe("Customers list: Points filter", () => {
  it("offers Has points and No points, with the URL's value", () => {
    const html = renderToString(
      <CustomersClient
        initialData={{ customers: { ok: true, rows: [], total: 0, page: 1, limit: 20 } }}
        initialFilters={{ search: null, tags: [], account: "all", source: "shopify", points: "has", sort: "newest" }}
      />,
    );
    expect(html).toContain("Has points");
    expect(html).toContain("No customers match these filters.");
    // In the mega filter's Account group.
    const account = groupFor("account", { points: "has" });
    expect(account).toContain('aria-label="Points"');
    expect(account).toContain("Has points");
  });
});

const facts: MigratedCustomerFacts = {
  createdByImport: true,
  importedAt: "2026-10-21T02:00:00Z",
  claimedAt: "2026-10-22T02:00:00Z",
  shopifyOrdersCount: 1,
  shopifyAmountSpent: 120,
  shopifyTags: [],
  shopifyNote: null,
  emailMarketingAtExport: "yes",
  exportedAt: "2026-10-20",
  batch: { id: "b1", fileName: "export.csv", appliedAt: "2026-10-21T02:05:00Z", rolledBackAt: null },
  claimLinkFirstClickedAt: "2026-10-22T01:30:00Z",
  claimBonusAt: "2026-11-03T02:00:00Z",
};

// The Journey shows these on the chapter that holds the import (PRD-customer-page-journey slice 04).
const detail = (f: MigratedCustomerFacts) =>
  renderToString(<FromShopifyCard migration={{ ok: true, facts: f }} importHistoryHref={null} bare />);

describe("From Shopify facts", () => {
  it("shows the Claim link's first click, and when the Claim bonus was granted", () => {
    const html = detail(facts);
    expect(html).toContain("Claim link");
    expect(html).toContain("First opened");
    expect(html).toContain("22 Oct 2026");
    expect(html).toContain("Claim bonus");
    expect(html).toContain("Granted on <!-- -->3 Nov 2026");
    expect(html).not.toMatch(/voucher/i);
  });

  it("says the link was not opened, and leaves the bonus row out without one", () => {
    expect(detail({ ...facts, claimLinkFirstClickedAt: null })).toContain("Not opened");
    expect(detail({ ...facts, claimBonusAt: null })).not.toContain("Claim bonus");
  });
});
