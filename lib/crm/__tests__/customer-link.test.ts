import { describe, expect, it } from "vitest";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { customerIdForResult } from "@/lib/crm/customer-link";

/**
 * PRD-crm-retention-loop slice 02: a Result's *Open customer* link finds the
 * Customer the way the storefront decides whose Result it is (by id, else by
 * email ignoring case and whitespace), and never guesses.
 */

const MEI = "c0000000-0000-4000-8000-000000000001";
const ANN = "c0000000-0000-4000-8000-000000000002";
const GONE = "c0000000-0000-4000-8000-000000000009";

const db = (): FakeDb => ({
  customers: [
    { id: MEI, email: "mei@example.com" },
    { id: ANN, email: "ann_lee@example.com" },
  ],
});

const find = (row: { customer_id: string | null; customer_email: string | null }, rows = db()) =>
  customerIdForResult(fakeSupabaseAdmin(rows) as never, row);

describe("customerIdForResult", () => {
  it("uses the Result's own Customer when it exists", async () => {
    expect(await find({ customer_id: MEI, customer_email: "someone-else@example.com" })).toBe(MEI);
  });

  it("matches a guest Result by email, ignoring case and spaces", async () => {
    expect(await find({ customer_id: null, customer_email: "  MEI@Example.com " })).toBe(MEI);
  });

  it("falls back to the email when the linked Customer no longer exists", async () => {
    expect(await find({ customer_id: GONE, customer_email: "mei@example.com" })).toBe(MEI);
  });

  it("treats an underscore as itself, not a wildcard", async () => {
    expect(await find({ customer_id: null, customer_email: "annxlee@example.com" })).toBeNull();
    expect(await find({ customer_id: null, customer_email: "ann_lee@example.com" })).toBe(ANN);
  });

  it("links nothing without a match, without an email, or when two rows match", async () => {
    expect(await find({ customer_id: null, customer_email: "nobody@example.com" })).toBeNull();
    expect(await find({ customer_id: null, customer_email: "  " })).toBeNull();
    expect(await find({ customer_id: null, customer_email: null })).toBeNull();
    const twins = db();
    twins.customers!.push({ id: GONE, email: "MEI@example.com" });
    expect(await find({ customer_id: null, customer_email: "mei@example.com" }, twins)).toBeNull();
  });
});
