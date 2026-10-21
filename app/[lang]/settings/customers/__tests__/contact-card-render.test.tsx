import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import type { ContactFacts, ContactFactsResult } from "@/lib/crm/contact-status";

/**
 * Contact and sign-in status (CRM slice 11): the Customer page's card, and the
 * marks in the list's Account column. Every line comes from a fact.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
}));

const { ContactCard } = await import("../[id]/customer-account-cards");
const { CustomersClient } = await import("../customers-client");

type CardCustomer = Pick<
  Customer,
  "email" | "phone" | "auth_user_id" | "account_linked_at" | "account_last_seen_at" | "account_providers"
>;

const guest: CardCustomer = {
  email: "ana@x.test",
  phone: null,
  auth_user_id: null,
  account_linked_at: null,
  account_last_seen_at: null,
  account_providers: [],
};

const member: CardCustomer = {
  ...guest,
  auth_user_id: "auth-1",
  account_linked_at: "2026-10-02T03:00:00Z",
  account_last_seen_at: "2026-10-20T06:00:00Z",
  account_providers: ["email", "google"],
  phone: "87805311",
};

const facts = (over: Partial<ContactFacts> = {}): ContactFactsResult => ({
  ok: true,
  facts: {
    phone: "87805311",
    whatsapp: { messagedAt: null, failedAt: null },
    otherNumbers: [],
    ...over,
  },
});

const card = (customer: CardCustomer, opts: { createdByImport?: boolean | null; contact?: ContactFactsResult } = {}) =>
  renderToString(<ContactCard customer={customer} {...opts} />);

describe("Contact and sign-in card: email and sign-in", () => {
  it("shows a Customer with an account as Verified, with the date, and how they sign in", () => {
    const html = card(member);
    expect(html).toContain("Contact and sign-in");
    expect(html).toContain("Verified: signed in with it since <!-- -->2 Oct 2026");
    expect(html).toContain("Email code and Google");
    expect(html).toContain("Last signed-in visit");
  });

  it("shows a Customer with no account as Not verified, with its source", () => {
    expect(card(guest)).toContain("Not verified:<!-- --> <!-- -->from checkout");
    expect(card(guest, { createdByImport: true })).toContain("from the Shopify import");
    expect(card(guest, { createdByImport: false })).toContain("from checkout");
    expect(card(guest)).toContain("No account yet");
    expect(card(guest)).not.toContain("Verified: signed in");
    expect(card(guest)).not.toContain("Last signed-in visit");
  });

  it("names one method, and says so when none is recorded yet", () => {
    expect(card({ ...member, account_providers: ["google"] })).toContain(">Google<");
    expect(card({ ...member, account_providers: [] })).toContain("Not recorded yet");
  });
});

describe("Contact and sign-in card: mobile and WhatsApp", () => {
  it("formats the mobile and says whether it is valid, never that it is verified", () => {
    const valid = card(member);
    expect(valid).toContain("+65 8780 5311");
    expect(valid).toContain("Valid Singapore mobile");
    expect(card({ ...member, phone: "12345678" })).toContain("Not a valid number");
    expect(card(guest)).toContain("No mobile on file");
    expect(valid).not.toMatch(/verified mobile/i);
  });

  it("shows the latest WhatsApp message from the number, or none yet", () => {
    expect(card(member, { contact: facts({ whatsapp: { messagedAt: "2026-10-23T09:30:00Z", failedAt: null } }) })).toContain(
      "Messaged us on WhatsApp on <!-- -->23 Oct 2026",
    );
    expect(card(member, { contact: facts() })).toContain("No WhatsApp message yet");
  });

  it("shows our failed WhatsApp while it is the latest fact", () => {
    const html = card(member, { contact: facts({ whatsapp: { messagedAt: null, failedAt: "2026-10-22T01:00:00Z" } }) });
    expect(html).toContain("Our last WhatsApp to this number failed on <!-- -->22 Oct 2026");
    expect(card(member, { contact: facts() })).not.toContain("failed on");
  });

  it("asks for a reload once the number on file is not the one the facts were read for", () => {
    const html = card({ ...member, phone: "91234567" }, { contact: facts({ whatsapp: { messagedAt: "2026-10-23T00:00:00Z", failedAt: null } }) });
    expect(html).toContain("Reload the page to check WhatsApp for this number.");
    expect(html).not.toContain("Messaged us on WhatsApp");
  });

  it("says when WhatsApp could not be checked, and leaves the row out with no number", () => {
    expect(card(member, { contact: { ok: false } })).toContain("Could not check WhatsApp.");
    expect(card(guest, { contact: facts({ phone: null }) })).not.toContain(">WhatsApp<");
  });
});

describe("Contact and sign-in card: other numbers seen", () => {
  it("lists them with where and when, or None", () => {
    const html = card(member, {
      contact: facts({
        otherNumbers: [{ phone: "+65 9123 4567", sources: ["booking", "result"], lastSeenAt: "2026-10-05T00:00:00Z" }],
      }),
    });
    expect(html).toContain("Other numbers seen");
    expect(html).toContain("+65 9123 4567");
    expect(html).toContain("booking, Result");
    expect(html).toContain("5 Oct 2026");
    expect(card(member, { contact: facts() })).toContain(">None<");
  });

  it("is left out when the viewer may see neither bookings nor Results", () => {
    expect(card(member, { contact: facts({ otherNumbers: null }) })).not.toContain("Other numbers seen");
  });
});

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
  welcome_voucher_state: "none",
  open_followups: 0,
  marketing_email: "not_subscribed",
  marketing_email_updated_at: null,
  ...over,
});

const list = (rows: CustomerOverviewRow[]) =>
  renderToString(
    <CustomersClient initialData={{ customers: { ok: true, rows, total: rows.length, page: 1, limit: 20 } }} />,
  );

describe("Customers list: Contact marks and filters", () => {
  it("marks the sign-in methods and a valid mobile in the Account column", () => {
    const html = list([
      row({
        has_account: true,
        account_linked_at: "2026-10-02T03:00:00Z",
        account_providers: ["email", "google"],
        has_phone: true,
        phone_valid: true,
      }),
    ]);
    expect(html).toContain('aria-label="Signs in with an email code"');
    expect(html).toContain('aria-label="Signs in with Google"');
    expect(html).toContain('aria-label="Valid number on file"');
  });

  it("shows no mobile mark for an invalid or missing number", () => {
    const html = list([row({ has_phone: true, phone_valid: false }), row({ id: "c2" })]);
    expect(html).not.toContain("Valid number on file");
    expect(html).not.toContain("Signs in with");
  });

  it("offers the Google and Mobile filters", () => {
    const html = list([]);
    expect(html).toContain('aria-label="Google"');
    expect(html).toContain('aria-label="Mobile"');
  });
});
