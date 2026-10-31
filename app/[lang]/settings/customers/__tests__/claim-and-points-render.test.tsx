import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { MigrationSummary, MigratedCustomerFacts } from "@/lib/customer-migration/overview";
import { DEFAULT_CUSTOMER_FILTERS, type CustomerListFilters } from "@/lib/crm/customer-filters";

/**
 * What the Claim link and the Claim bonus add to the Customers page
 * (migration slice 06; PRD-loyalty-points slice 06, which retired the
 * Welcome-back voucher): the Migration card's Clicked, Claim bonus, Points
 * spent and Revenue; the list's Points filter; and the From Shopify card's
 * first click and Claim bonus.
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
const { migrationCells } = await import("../migration-card");
const { CustomerDetailClient } = await import("../[id]/customer-detail-client");

const summary: MigrationSummary = {
  imported: 1200,
  created: 900,
  matched: 300,
  signedUp: 150,
  signedUpBeforeImport: 40,
  batchesApplied: 1,
  clicked: 300,
  claimBonuses: 120,
  migratedPointsSpent: 31000,
  pointsOrders: 31,
  pointsRevenue: 4250.5,
  emailed: 960,
  emailsBounced: 12,
  emailsComplained: 1,
};

describe("Migration card", () => {
  it("adds Clicked (of imported), the Claim bonus (of imported), the points spent and the Revenue of their paid orders", () => {
    const cells = migrationCells(summary);
    // Migration 08's Emailed sits before Clicked, in funnel order.
    expect(cells.map((c) => c.label)).toEqual([
      "Imported",
      "Signed up",
      "Emailed",
      "Clicked",
      "Claim bonus",
      "Points spent",
      "Revenue",
    ]);
    const cell = (label: string) => cells.find((c) => c.label === label)!;
    expect(cell("Clicked")).toEqual({ label: "Clicked", value: "300 (25%)", detail: "opened their Claim link" });
    expect(cell("Claim bonus")).toEqual({ label: "Claim bonus", value: "120 (10%)", detail: "got the sign-in bonus in points" });
    // A balance is always shown in points and dollars (ADR 0030 (b)).
    expect(cell("Points spent")).toEqual({ label: "Points spent", value: "31,000 points (S$310.00)", detail: "on 31 paid orders" });
    expect(cell("Revenue").value).toMatch(/4,250\.50$/);
    expect(cell("Revenue").detail).toBe("from 31 paid orders that used points");
  });

  it("reads one paid order in the singular", () => {
    const cells = migrationCells({ ...summary, pointsOrders: 1 });
    expect(cells.find((c) => c.label === "Points spent")!.detail).toBe("on 1 paid order");
    expect(cells.find((c) => c.label === "Revenue")!.detail).toBe("from 1 paid order that used points");
  });

  it("says nothing of a voucher", () => {
    expect(JSON.stringify(migrationCells(summary))).not.toMatch(/voucher/i);
  });
});

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

const customer = {
  id: "c1",
  email: "ana@x.test",
  auth_user_id: "auth-1",
  first_name: "Ana",
  last_name: "Tan",
  phone: null,
  locale: "en-US",
  tags: [],
  notes: null,
  total_orders: 0,
  total_spent: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  account_linked_at: "2026-10-22T02:00:00Z",
  account_last_seen_at: null,
} as unknown as Customer;

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

const detail = (f: MigratedCustomerFacts) =>
  renderToString(
    <CustomerDetailClient
      initialData={{ customer: { ok: true, row: customer }, notes: [], migration: { ok: true, facts: f } }}
      canEdit={false}
      canImport={false}
      viewer={{ userId: "u1", grantsAll: false }}
    />,
  );

describe("From Shopify card", () => {
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
