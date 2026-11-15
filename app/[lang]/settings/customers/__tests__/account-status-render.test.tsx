import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import type { AdminCustomerLifecycle } from "@/lib/ecommerce/admin/customers";
import type { MigratedCustomerFacts } from "@/lib/customer-migration/overview";
import { DEFAULT_CUSTOMER_FILTERS, type CustomerListFilters } from "@/lib/crm/customer-filters";

/**
 * Account status on every Customer, and the Shopify migration surfaces
 * (migration slice 12): the list's Account column and Shopify badge, and the
 * detail page's Account and From Shopify cards. The Migration card left the
 * list on 2026-11-01.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
}));

const { CustomersClient } = await import("../customers-client");
const { CustomerDetailClient } = await import("../[id]/customer-detail-client");
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
  claim_link_first_clicked_at: null,
  points_available: 0,
  claim_bonus_at: null,
  open_followups: 0,
  paid_orders: 0,
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
  last_purchase_dated_by_fitting: false,
  ...over,
});

const list = (rows: CustomerOverviewRow[]) =>
  renderToString(<CustomersClient initialData={{ customers: { ok: true, rows, total: rows.length, page: 1, limit: 20 } }} />);

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

  it("offers the Account, Source, Email consent and Sort controls with the URL's values", () => {
    const html = renderToString(
      <CustomersClient
        initialData={{ customers: { ok: true, rows: [], total: 0, page: 1, limit: 20 } }}
        initialFilters={{
          search: null,
          tags: [],
          account: "no-account",
          source: "shopify",
          points: "all",
          consent: "unsubscribed",
          sort: "signed-up",
        }}
      />,
    );
    // The sort stays in the toolbar; the filters are the mega filter's, and their chips.
    expect(html).toContain('aria-label="Sort"');
    expect(html).toMatch(/Filters<span[^>]*data-slot="badge"[^>]*>3</);
    const account = groupFor("account", { account: "no-account", source: "shopify" });
    for (const label of ['aria-label="Account"', 'aria-label="Source"']) expect(account).toContain(label);
    expect(account).toContain("No account, email not verified");
    expect(groupFor("reach", { consent: "unsubscribed" })).toContain('aria-label="Email consent"');
    expect(html).toContain("No account");
    expect(html).toContain("From Shopify");
    expect(html).toContain("Email unsubscribed");
    expect(html).toContain("Recently signed up");
    expect(html).toContain("No customers match these filters.");
  });

  it("has no Shopify migration card: the Customer lifecycle chart replaced it (owner, 2026-11-01)", () => {
    expect(list([])).not.toContain("Shopify migration");
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
  claimLinkFirstClickedAt: null,
  claimBonusAt: null,
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

const { FromShopifyCard, SignInFacts } = await import("../[id]/customer-account-cards");

/** The From Shopify facts as the Journey shows them, on the chapter that holds the import. */
const shopify = (migration?: { ok: true; facts: MigratedCustomerFacts | null } | { ok: false }, canImport = false) =>
  renderToString(
    <FromShopifyCard migration={migration} importHistoryHref={canImport ? "/en-US/settings/customers/import" : null} bare />,
  );

// CRM slice 11 grew the Account card into the Contact and sign-in card.
// PRD-customer-page-journey slice 01 split it: Contact details keeps the
// sign-up date (as *Verified since*), and the Sign-in row holds how they sign
// in and the last signed-in visit.
describe("Customer detail: Contact details and the Sign-in row (was the Account card)", () => {
  const member = customer({
    auth_user_id: "auth-1",
    account_linked_at: "2026-10-02T03:00:00Z",
    account_last_seen_at: "2026-10-20T06:00:00Z",
  });

  it("says when a signed-up Customer signed up, on the page as it opens", () => {
    const html = detail(member);
    expect(html).toContain("Contact details");
    expect(html).toContain("Verified: signed in with it since <!-- -->2 Oct 2026");
    expect(html).toContain('aria-label="About the sign-up date"');
    // The row is closed: its line says how they sign in, and its facts wait for a press.
    expect(html).toContain(">Sign-in<");
    expect(html).not.toContain("Last signed-in visit");
  });

  it("shows their last signed-in visit in the Sign-in row", () => {
    const html = renderToString(<SignInFacts customer={member} />);
    expect(html).toContain("Last signed-in visit");
    expect(html).toContain("20 Oct 2026");
  });

  it("tells Staff how a Customer with no account becomes one", () => {
    expect(detail(customer({}))).toContain("No account yet");
    const html = renderToString(<SignInFacts customer={customer({})} />);
    expect(html).toContain("No account yet: they become a signed-up customer the first time they sign in");
    expect(html).toContain("ana@x.test");
    expect(html).not.toContain("Last signed-in visit");
  });
});

// The From Shopify card is no longer a card on the page: the Journey shows its
// facts on the chapter that holds the import (PRD-customer-page-journey slice 04).
describe("Customer detail: From Shopify facts", () => {
  it("are left out for a Customer who is not a Migrated customer", () => {
    expect(shopify({ ok: true, facts: null })).toBe("");
    expect(shopify()).toBe("");
  });

  it("are not a card of their own on the page", () => {
    expect(detail(customer({}), { ok: true, facts })).not.toContain("From Shopify");
  });

  it("show the Shopify-era facts, apart from the platform's", () => {
    const html = shopify({ ok: true, facts });
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

  it("say Created by the import, and the Claim once there is one", () => {
    const html = shopify({ ok: true, facts: { ...facts, createdByImport: true, claimedAt: "2026-10-25T00:00:00Z" } });
    expect(html).toContain("Created by the import");
    expect(html).toContain("Claimed on <!-- -->25 Oct 2026");
  });

  it("link the batch in the import history only for customer-import", () => {
    expect(shopify({ ok: true, facts }, true)).toContain('href="/en-US/settings/customers/import#batch-b1"');
    expect(shopify({ ok: true, facts }, false)).not.toContain("#batch-b1");
  });

  it("say so when the facts could not be read", () => {
    expect(shopify({ ok: false })).toContain("Could not load what the Shopify import holds");
  });
});

describe("Customer detail: Lifecycle stage", () => {
  const withStage = (lifecycle: AdminCustomerLifecycle | null) =>
    renderToString(
      <CustomerDetailClient
        initialData={{ customer: { ok: true, row: customer({}) }, notes: [], lifecycle }}
        canEdit={false}
        viewer={{ userId: "u1", grantsAll: false }}
      />,
    );

  const lifecycle = (over: Partial<AdminCustomerLifecycle>): AdminCustomerLifecycle => ({
    purchases: 1,
    last_purchase_at: "2026-10-01T02:00:00Z",
    attended_bookings: 0,
    last_readjusted_at: null,
    lifecycle_stage: "new",
    lifecycle_detail: "delivered",
    lifecycle_undated: false,
    marketing_email_updated_at: null,
    unengaged: false,
    last_purchase_dated_by_fitting: false,
    ...over,
  });

  it("shows the stage beside the name with its note, and purchases, bookings and the last purchase in Stats", () => {
    const html = withStage(lifecycle({}));
    expect(html.match(/>New</g)?.length).toBe(1);
    expect(html).toContain("Delivered");
    expect(html).toContain(">Purchases<");
    expect(html).toContain(">Bookings attended<");
    expect(html).toContain(">Last purchase<");
    expect(html).toContain("1 Oct 2026");
  });

  it("says why a Customer is Loyal, with their bookings and the latest one", () => {
    const html = withStage(
      lifecycle({
        purchases: 1,
        attended_bookings: 2,
        last_readjusted_at: "2026-09-08T03:00:00Z",
        lifecycle_stage: "loyal",
        lifecycle_detail: "bookings",
      }),
    );
    expect(html).toContain(">Loyal<");
    expect(html).toContain(">Bookings<");
    const value = (label: string) => html.match(new RegExp(`>${label}<[\\s\\S]*?<dd[^>]*>([^<]*)<`))?.[1];
    expect(value("Purchases")).toBe("1");
    expect(value("Bookings attended")).toBe("2");
    expect(value("Last booking")).toBe("8 Sept 2026");
  });

  it("says a Shopify-only buyer's last purchase was on Shopify, with no dates yet", () => {
    const html = withStage(
      lifecycle({ purchases: 3, last_purchase_at: null, lifecycle_stage: "loyal", lifecycle_detail: "repeat_purchases", lifecycle_undated: true }),
    );
    expect(html).toContain(">Loyal<");
    expect(html).toContain("Repeat purchases · No dates yet");
    expect(html).toContain("On Shopify");
  });

  it("dates a Shopify-era purchase by the fitting, and says so (ADR 0042 m)", () => {
    const html = withStage(
      lifecycle({
        purchases: 1,
        last_purchase_at: "2024-03-01T02:00:00Z",
        lifecycle_stage: "at_risk",
        lifecycle_detail: "lapsed",
        last_purchase_dated_by_fitting: true,
      }),
    );
    expect(html).toContain(">At risk<");
    expect(html).not.toContain("No dates yet");
    expect(html).toContain("Fitting, on Shopify");
    expect(html).toContain("dated by their latest fitting record");
  });

  it("says a Lapsed Customer is Unengaged, with the rule on hover (PRD-campaign-audiences slice 12)", () => {
    const html = withStage(
      lifecycle({ last_purchase_at: "2024-03-01T02:00:00Z", lifecycle_stage: "at_risk", lifecycle_detail: "lapsed", unengaged: true }),
    );
    expect(html).toContain(">At risk<");
    expect(html).toContain("Lapsed · Unengaged");
    expect(html).toContain("Clicked none of their last 6 campaign emails");
    expect(withStage(lifecycle({ lifecycle_stage: "at_risk", lifecycle_detail: "lapsed" }))).not.toContain("Unengaged");
  });

  it("shows the next step above the cards, offering a follow-up only to someone who can add one (PRD-crm-retention-loop slice 05)", () => {
    const step = { kind: "checkup_due" as const, text: "Check-up due: no re-adjustment in a year", addFollowUp: true };
    const render = (canEdit: boolean, nextStep: typeof step | null) =>
      renderToString(
        <CustomerDetailClient
          initialData={{ customer: { ok: true, row: customer({}) }, notes: [], lifecycle: lifecycle({}), nextStep }}
          canEdit={canEdit}
          viewer={{ userId: "u1", grantsAll: false }}
        />,
      );
    expect(render(true, step)).toContain("Check-up due: no re-adjustment in a year");
    expect(render(true, step)).toContain("Add a follow-up");
    expect(render(false, step)).not.toContain("Add a follow-up");
    expect(render(true, null)).not.toContain("Next step");
  });

  it("says when a Lost Customer unsubscribed", () => {
    const html = withStage(
      lifecycle({ lifecycle_stage: "lost", lifecycle_detail: null, marketing_email_updated_at: "2026-10-12T03:00:00Z" }),
    );
    expect(html.match(/>Lost</g)?.length).toBe(1);
    expect(html).toContain("Unsubscribed 12 Oct 2026");
  });

  it("leaves the stage out when it could not be read", () => {
    const html = withStage(null);
    expect(html).not.toContain(">Purchases<");
    expect(html).toContain(">Total orders<");
  });
});
