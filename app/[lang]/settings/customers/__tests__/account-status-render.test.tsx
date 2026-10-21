import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import type { MigrationSummary, MigratedCustomerFacts } from "@/lib/customer-migration/overview";

/**
 * Account status on every Customer, and the Shopify migration surfaces
 * (migration slice 12): the list's Account column, Shopify badge and Migration
 * card, and the detail page's Account and From Shopify cards.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");
const { MigrationCard, migrationCells } = await import("../migration-card");
const { CustomerDetailClient } = await import("../[id]/customer-detail-client");

const row = (over: Partial<CustomerOverviewRow>): CustomerOverviewRow => ({
  id: "c1",
  email: "ana@x.test",
  first_name: "Ana",
  last_name: "Tan",
  phone: null,
  tags: [],
  total_orders: 0,
  total_spent: 0,
  created_at: "2026-09-01T00:00:00Z",
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
  open_followups: 0,
  ...over,
});

const summary: MigrationSummary = {
  imported: 1200,
  created: 900,
  matched: 300,
  signedUp: 150,
  signedUpBeforeImport: 40,
  batchesApplied: 1,
};

const list = (rows: CustomerOverviewRow[], migration: MigrationSummary | null = null) =>
  renderToString(
    <CustomersClient
      initialData={{ customers: { ok: true, rows, total: rows.length, page: 1, limit: 20 } }}
      migration={migration}
    />,
  );

describe("Customers list", () => {
  it("shows Signed up with the date, or a muted No account", () => {
    const html = list([
      row({ id: "a", has_account: true, account_linked_at: "2026-10-02T03:00:00Z" }),
      row({ id: "b", email: "ben@x.test", first_name: "Ben" }),
    ]);
    expect(html).toContain(">Account<");
    expect(html).toContain("Signed up");
    expect(html).toContain("2 Oct 2026");
    expect(html).toContain("No account");
  });

  it("puts a Shopify badge beside every Migrated customer's name, and only theirs", () => {
    expect(list([row({ from_shopify: true, created_by_import: true })])).toContain(">Shopify<");
    expect(list([row({})])).not.toContain(">Shopify<");
  });

  it("offers the Account, Source and Sort controls with the URL's values", () => {
    const html = renderToString(
      <CustomersClient
        initialData={{ customers: { ok: true, rows: [], total: 0, page: 1, limit: 20 } }}
        initialFilters={{ search: null, tags: [], account: "no-account", source: "shopify", sort: "signed-up" }}
      />,
    );
    for (const label of ['aria-label="Account"', 'aria-label="Source"', 'aria-label="Sort"']) expect(html).toContain(label);
    expect(html).toContain("No account");
    expect(html).toContain("From Shopify");
    expect(html).toContain("Recently signed up");
    expect(html).toContain("No customers match these filters.");
  });

  it("shows the Migration card once a batch is applied, and not before", () => {
    expect(list([], summary)).toContain("Shopify migration");
    expect(list([], { ...summary, batchesApplied: 0 })).not.toContain("Shopify migration");
    expect(list([], null)).not.toContain("Shopify migration");
  });
});

describe("Migration card", () => {
  it("reads N (created a, matched b) and s (s/N %), of which k had an account before import", () => {
    expect(migrationCells(summary)).toEqual([
      { label: "Imported", value: "1,200", detail: "created 900, matched 300" },
      { label: "Signed up", value: "150 (13%)", detail: "of which 40 already had an account before import" },
    ]);
  });

  it("links to the list of those from Shopify not signed up yet", () => {
    const html = renderToString(
      <MigrationCard summary={summary} notSignedUpHref="/en-US/settings/customers?account=no-account&amp;source=shopify" onShowNotSignedUp={() => {}} />,
    );
    expect(html).toContain("1,050");
    expect(html).toContain("from Shopify not signed up yet");
    expect(html).toContain("account=no-account");
  });
});

const customer = (over: Partial<Customer>): Customer =>
  ({
    id: "c1",
    email: "ana@x.test",
    auth_user_id: null,
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
    account_linked_at: null,
    account_last_seen_at: null,
    account_providers: [],
    ...over,
  }) as Customer;

const facts: MigratedCustomerFacts = {
  createdByImport: false,
  importedAt: "2026-10-21T02:00:00Z",
  claimedAt: null,
  shopifyOrdersCount: 3,
  shopifyAmountSpent: 420.5,
  shopifyTags: ["wholesale"],
  shopifyNote: "Prefers firm",
  emailMarketingAtExport: "yes",
  exportedAt: "2026-10-20",
  batch: { id: "b1", fileName: "customers_export.csv", appliedAt: "2026-10-21T02:05:00Z", rolledBackAt: null },
};

const detail = (c: Customer, migration?: { ok: true; facts: MigratedCustomerFacts | null } | { ok: false }, canImport = false) =>
  renderToString(
    <CustomerDetailClient
      initialData={{ customer: { ok: true, row: c }, notes: [], migration }}
      canEdit={false}
      canImport={canImport}
      viewer={{ userId: "u1", grantsAll: false }}
    />,
  );

// CRM slice 11 grew the Account card into the Contact and sign-in card, which
// keeps the sign-up date (as *Verified since*) and the last signed-in visit.
describe("Customer detail: Contact and sign-in card (was the Account card)", () => {
  it("says when a signed-up Customer signed up, and their last signed-in visit", () => {
    const html = detail(
      customer({
        auth_user_id: "auth-1",
        account_linked_at: "2026-10-02T03:00:00Z",
        account_last_seen_at: "2026-10-20T06:00:00Z",
      }),
    );
    expect(html).toContain("Verified: signed in with it since <!-- -->2 Oct 2026");
    expect(html).toContain("Last signed-in visit");
    expect(html).toContain("20 Oct 2026");
    expect(html).toContain('aria-label="About the sign-up date"');
  });

  it("tells Staff how a Customer with no account becomes one", () => {
    const html = detail(customer({}));
    expect(html).toContain("No account yet: they become a signed-up customer the first time they sign in");
    expect(html).toContain("ana@x.test");
    expect(html).not.toContain("Last signed-in visit");
  });
});

describe("Customer detail: From Shopify card", () => {
  it("is left out for a Customer who is not a Migrated customer", () => {
    expect(detail(customer({}), { ok: true, facts: null })).not.toContain("From Shopify");
    expect(detail(customer({}))).not.toContain("From Shopify");
  });

  it("shows the Shopify-era facts, apart from the platform's", () => {
    const html = detail(customer({}), { ok: true, facts });
    expect(html).toContain("From Shopify");
    expect(html).toContain("21 Oct 2026");
    expect(html).toContain("customers_export.csv");
    expect(html).toContain("Matched to an existing Customer");
    expect(html).toContain("3<!-- --> order");
    expect(html).toContain("420.50");
    expect(html).toContain("On Shopify, not linked to this account");
    expect(html).toContain("wholesale");
    expect(html).toContain("Prefers firm");
    expect(html).toContain("Accepted");
    expect(html).not.toContain("Claimed on");
  });

  it("says Created by the import, and the Claim once there is one", () => {
    const html = detail(customer({}), { ok: true, facts: { ...facts, createdByImport: true, claimedAt: "2026-10-25T00:00:00Z" } });
    expect(html).toContain("Created by the import");
    expect(html).toContain("Claimed on <!-- -->25 Oct 2026");
  });

  it("links the batch in the import history only for customer-import", () => {
    expect(detail(customer({}), { ok: true, facts }, true)).toContain('href="/en-US/settings/customers/import#batch-b1"');
    expect(detail(customer({}), { ok: true, facts }, false)).not.toContain("#batch-b1");
  });

  it("says so when the facts could not be read", () => {
    expect(detail(customer({}), { ok: false })).toContain("Could not load what the Shopify import holds");
  });
});
