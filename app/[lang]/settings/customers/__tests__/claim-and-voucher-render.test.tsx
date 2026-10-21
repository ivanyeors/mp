import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { MigrationSummary, MigratedCustomerFacts } from "@/lib/customer-migration/overview";

/**
 * What the Claim link and the Welcome-back voucher add to the Customers page
 * (migration slice 06): the Migration card's Clicked, Voucher used and
 * Revenue; the list's Voucher filter; and the From Shopify card's first click
 * and voucher.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");
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
  vouchersIssued: 120,
  vouchersUsed: 30,
  voucherOrders: 31,
  voucherRevenue: 4250.5,
};

describe("Migration card", () => {
  it("adds Clicked (of imported), Voucher used (of issued) and the Revenue of their paid orders", () => {
    const cells = migrationCells(summary);
    expect(cells.map((c) => c.label)).toEqual(["Imported", "Signed up", "Clicked", "Voucher used", "Revenue"]);
    expect(cells[2]).toEqual({ label: "Clicked", value: "300 (25%)", detail: "opened their Claim link" });
    expect(cells[3]).toEqual({ label: "Voucher used", value: "30", detail: "of 120 welcome-back vouchers issued" });
    expect(cells[4].value).toMatch(/4,250\.50$/);
    expect(cells[4].detail).toBe("from 31 paid orders that used a welcome-back voucher");
  });

  it("reads one paid order and one voucher in the singular", () => {
    const cells = migrationCells({ ...summary, vouchersIssued: 1, voucherOrders: 1 });
    expect(cells[3].detail).toBe("of 1 welcome-back voucher issued");
    expect(cells[4].detail).toBe("from 1 paid order that used a welcome-back voucher");
  });
});

describe("Customers list: Voucher filter", () => {
  it("offers Issued, unused and Used, with the URL's value", () => {
    const html = renderToString(
      <CustomersClient
        initialData={{ customers: { ok: true, rows: [], total: 0, page: 1, limit: 20 } }}
        initialFilters={{ search: null, tags: [], account: "all", source: "shopify", voucher: "issued", sort: "newest" }}
      />,
    );
    expect(html).toContain('aria-label="Voucher"');
    expect(html).toContain("Voucher issued, unused");
    expect(html).toContain("No customers match these filters.");
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
  welcomeVoucher: {
    code: "WB-ABCDEFGHJK",
    state: "issued",
    discountType: "fixed_amount",
    value: 20,
    currency: "SGD",
    expiresAt: "2026-12-21T02:00:00Z",
  },
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
  it("shows the Claim link's first click, and the voucher's code, state and expiry", () => {
    const html = detail(facts);
    expect(html).toContain("Claim link");
    expect(html).toContain("First opened");
    expect(html).toContain("22 Oct 2026");
    expect(html).toContain("WB-ABCDEFGHJK");
    expect(html).toContain("Issued, unused");
    expect(html).toContain("21 Dec 2026");
    expect(html).toContain("20.00 off");
  });

  it("says the link was not opened, and shows each voucher state", () => {
    expect(detail({ ...facts, claimLinkFirstClickedAt: null })).toContain("Not opened");
    expect(detail({ ...facts, welcomeVoucher: { ...facts.welcomeVoucher!, state: "used" } })).toContain(">Used<");
    expect(detail({ ...facts, welcomeVoucher: { ...facts.welcomeVoucher!, state: "expired" } })).toContain(">Expired<");
    expect(detail({ ...facts, welcomeVoucher: null })).not.toContain("Welcome-back voucher");
  });
});
