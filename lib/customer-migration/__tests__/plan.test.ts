import { describe, expect, it } from "vitest";
import {
  duplicateSkips,
  existingFromMatches,
  lookupKeys,
  NO_EXISTING,
  normaliseRows,
  planCustomerRow,
  planRows,
  type ExistingCustomer,
  type ExistingLookup,
} from "@/lib/customer-migration/plan";
import {
  normaliseShopifyRow,
  type NormalisedShopifyRow,
  type ShopifyRawRow,
} from "@/lib/customer-migration/shopify-csv";
import { FIVE_ROWS_MATCHES } from "./fixtures";

const row = (over: ShopifyRawRow = {}): NormalisedShopifyRow => {
  const r = normaliseShopifyRow({
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Example",
    phone: "91234567",
    address1: "1 Example Street",
    zip: "238801",
    countryCode: "SG",
    customerId: "7000000000001",
    totalOrders: "1",
    totalSpent: "610",
    acceptsEmailMarketing: "yes",
    ...over,
  });
  if (!r.ok) throw new Error(r.reason);
  return r.row;
};

const customer = (over: Partial<ExistingCustomer> = {}): ExistingCustomer => ({
  customer_id: "c-1",
  has_account: false,
  has_first_name: false,
  has_last_name: false,
  has_phone: false,
  has_address: false,
  migrated: null,
  ...over,
});

const lookup = (byEmail: Record<string, ExistingCustomer> = {}, ids: string[] = []): ExistingLookup => ({
  customersByEmail: new Map(Object.entries(byEmail)),
  migratedShopifyIds: new Set(ids),
});

describe("planCustomerRow", () => {
  it("creates when no Customer holds the email", () => {
    expect(planCustomerRow(row(), NO_EXISTING)).toEqual({ outcome: "create" });
  });

  it("merges into an existing Customer who has an account (a claimed row), and into one who has not", () => {
    for (const has_account of [true, false]) {
      const plan = planCustomerRow(row(), lookup({ "ana@example.com": customer({ has_account }) }));
      expect(plan.outcome, String(has_account)).toBe("merge");
    }
  });

  it("fills only the Customer's null names and phone, and adds the address only when it has none", () => {
    expect(planCustomerRow(row(), lookup({ "ana@example.com": customer() }))).toEqual({
      outcome: "merge",
      customer_id: "c-1",
      fill: ["first_name", "last_name", "phone", "address"],
    });
    const full = customer({ has_first_name: true, has_last_name: true, has_phone: true, has_address: true });
    expect(planCustomerRow(row(), lookup({ "ana@example.com": full }))).toEqual({
      outcome: "merge",
      customer_id: "c-1",
      fill: [],
    });
    // Nothing to fill from an empty Shopify field.
    const sparse = row({ firstName: "", phone: "", address1: "" });
    expect(planCustomerRow(sparse, lookup({ "ana@example.com": customer() }))).toMatchObject({ fill: ["last_name"] });
  });

  it("is already_imported on a re-run: migrated_customers holds the Shopify id", () => {
    expect(planCustomerRow(row(), lookup({}, ["7000000000001"]))).toEqual({ outcome: "already_imported" });
  });

  it("is already_imported when the email's Migrated customer has the same Shopify id, or either id is absent", () => {
    const migrated = (id: string | null) => lookup({ "ana@example.com": customer({ migrated: { shopify_customer_id: id } }) });
    expect(planCustomerRow(row(), migrated("7000000000001")).outcome).toBe("already_imported");
    expect(planCustomerRow(row(), migrated(null)).outcome).toBe("already_imported");
    expect(planCustomerRow(row({ customerId: "" }), migrated("7000000000009")).outcome).toBe("already_imported");
  });

  it("skips an email that belongs to a Migrated customer with a different Shopify id", () => {
    const existing = lookup({ "ana@example.com": customer({ migrated: { shopify_customer_id: "7000000000009" } }) });
    expect(planCustomerRow(row(), existing)).toEqual({ outcome: "skip", reason: "email_already_migrated" });
  });
});

describe("duplicates in one file", () => {
  const indexed = (raws: ShopifyRawRow[]) => normaliseRows(raws.map((raw, i) => ({ i, raw })));
  const base = { totalOrders: "0", totalSpent: "0", acceptsEmailMarketing: "no" };

  it("skips both rows that share an email, after lowercasing, rather than guessing", () => {
    const rows = indexed([
      { ...base, email: "Same@Example.com", customerId: "1" },
      { ...base, email: "other@example.com", customerId: "2" },
      { ...base, email: " same@example.com ", customerId: "3" },
    ]);
    expect([...duplicateSkips(rows)]).toEqual([
      [0, "duplicate_email_in_file"],
      [2, "duplicate_email_in_file"],
    ]);
  });

  it("skips both rows that share a Shopify id", () => {
    const rows = indexed([
      { ...base, email: "a@example.com", customerId: "5" },
      { ...base, email: "b@example.com", customerId: "'5" },
      { ...base, email: "c@example.com" },
      { ...base, email: "d@example.com" },
    ]);
    expect([...duplicateSkips(rows)]).toEqual([
      [0, "duplicate_customer_id_in_file"],
      [1, "duplicate_customer_id_in_file"],
    ]);
  });

  it("ignores rows that cannot be imported anyway", () => {
    expect(duplicateSkips(indexed([{ ...base }, { ...base, email: "" }])).size).toBe(0);
  });
});

describe("planRows", () => {
  const indexed = (raws: ShopifyRawRow[]) => normaliseRows(raws.map((raw, i) => ({ i, raw })));
  const base = { totalOrders: "0", totalSpent: "0", acceptsEmailMarketing: "no" };

  it("answers every row once, keyed by its index, with no PII", () => {
    const rows = normaliseRows([
      { i: 7, raw: { ...base, email: "new@example.com", phone: "nope" } },
      { i: 9, raw: { ...base, email: "" } },
    ]);
    const out = planRows(rows, NO_EXISTING);
    expect(out).toEqual([
      { i: 7, outcome: "create", repairs: ["phone_dropped"] },
      { i: 9, outcome: "skip", reason: "no_email", repairs: [] },
    ]);
    expect(JSON.stringify(out)).not.toContain("@");
  });

  it("reports repairs only for rows that would be written", () => {
    const rows = indexed([
      { ...base, email: "x@example.com", customerId: "1", phone: "nope" },
      { ...base, email: "dupe@example.com", phone: "nope" },
      { ...base, email: "dupe@example.com", phone: "nope" },
    ]);
    expect(planRows(rows, lookup({}, ["1"])).map((p) => p.repairs)).toEqual([[], [], []]);
  });

  it("collects the keys to look up from importable rows only", () => {
    const rows = indexed([
      { ...base, email: "A@example.com", customerId: "1" },
      { ...base, email: "bad" , customerId: "2" },
      { ...base, email: "b@example.com" },
    ]);
    expect(lookupKeys(rows)).toEqual({ emails: ["a@example.com", "b@example.com"], shopifyIds: ["1"] });
  });
});

describe("existingFromMatches", () => {
  it("reads customer_import_preview_matches rows into the lookup", () => {
    const existing = existingFromMatches([
      ...FIVE_ROWS_MATCHES,
      {
        match: "email",
        key: "dev.sample@example.com",
        customer_id: "c-4",
        has_account: false,
        has_first_name: true,
        has_last_name: true,
        has_phone: false,
        has_address: true,
        migrated: true,
        migrated_shopify_customer_id: "7000000000004",
      },
    ]);
    expect(existing.migratedShopifyIds).toEqual(new Set(["7000000000004"]));
    expect(existing.customersByEmail.get("ben.sample@example.com")).toEqual({
      customer_id: "00000000-0000-4000-8000-000000000002",
      has_account: true,
      has_first_name: true,
      has_last_name: false,
      has_phone: false,
      has_address: false,
      migrated: null,
    });
    expect(existing.customersByEmail.get("dev.sample@example.com")?.migrated).toEqual({
      shopify_customer_id: "7000000000004",
    });
  });
});
