import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 03: the Customer timeline shows a Result on a Customer exactly when that
 * Customer's own login could open it (PRD risk table, "A test pins the two
 * together"). Both use `isCustomersResult`; this proves `authorizeResultAccess`
 * still answers the same, and that the query pattern finds the same rows.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, user: null as { id: string } | null }));

vi.mock("@/lib/auth/user", () => ({ getAuthUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { authorizeResultAccess } = await import("@/lib/results/access");
const { isCustomersResult, normaliseResultEmail, resultEmailPattern } = await import("@/lib/results/owner");

const MEI = "aaaaaaaa-0000-4000-8000-000000000001";
const KIM = "aaaaaaaa-0000-4000-8000-000000000002";

/** [what, customers.email, Result customer_id, Result customer_email, theirs?] */
const CASES: Array<[string, string, string | null, string | null, boolean]> = [
  ["their id", "mei@x.test", MEI, null, true],
  ["their id, someone else's email", "mei@x.test", MEI, "kim@x.test", true],
  ["a guest Result with their email", "mei@x.test", null, "mei@x.test", true],
  ["their email in another case, padded", "mei@x.test", null, "  MEI@X.Test ", true],
  ["their email on someone else's id", "mei@x.test", KIM, "Mei@x.test", true],
  ["a padded, mixed-case Customer email", " Mei@X.test", null, "mei@x.test", true],
  ["an email that contains theirs", "mei@x.test", KIM, "xmei@x.test", false],
  ["an email theirs is a prefix of", "mei@x.test", KIM, "mei@x.test.sg", false],
  ["a wildcard-shaped email", "mei@x.test", null, "mei@x_test", false],
  ["no email at all", "mei@x.test", KIM, null, false],
  ["a blank email", "mei@x.test", null, "   ", false],
  ["someone else's id and email", "mei@x.test", KIM, "kim@x.test", false],
];

describe("isCustomersResult", () => {
  it.each(CASES)("%s", (_what, email, customerId, resultEmail, theirs) => {
    expect(isCustomersResult({ id: MEI, email }, { customer_id: customerId, customer_email: resultEmail })).toBe(theirs);
  });

  it("normalises an email by case and surrounding whitespace only", () => {
    expect(normaliseResultEmail("  Mei@X.Test ")).toBe("mei@x.test");
    expect(normaliseResultEmail("   ")).toBeNull();
    expect(normaliseResultEmail(null)).toBeNull();
  });
});

describe("authorizeResultAccess agrees with it", () => {
  beforeEach(() => {
    h.user = { id: "auth-mei" };
  });

  it.each(CASES)("%s", async (_what, email, customerId, resultEmail, theirs) => {
    h.db = { customers: [{ id: MEI, email, auth_user_id: "auth-mei" }] };
    const row = { access_token: null, customer_id: customerId, customer_email: resultEmail };
    await expect(authorizeResultAccess(row, null)).resolves.toBe(theirs);
    expect(isCustomersResult({ id: MEI, email }, row)).toBe(theirs);
  });
});

describe("resultEmailPattern", () => {
  it("finds exactly the guest Results the rule calls theirs", () => {
    const stored = ["mei@x.test", "  MEI@X.Test ", "\tmei@x.test\n", "xmei@x.test", "mei@x.test.sg", "mei@xxtest", "meix@x.test", "kim@x.test"];
    const pattern = new RegExp(resultEmailPattern("Mei@X.test")!, "i");
    for (const value of stored) {
      expect(pattern.test(value), value).toBe(isCustomersResult({ id: MEI, email: "Mei@X.test" }, { customer_id: null, customer_email: value }));
    }
  });

  it("escapes every regex metacharacter an address can carry", () => {
    const odd = "a.b+c(d)[e]{f}|g^h$i?j*k\\l@x.test";
    const pattern = new RegExp(resultEmailPattern(odd)!, "i");
    expect(pattern.test(odd)).toBe(true);
    expect(pattern.test(odd.replace(".", "Z"))).toBe(false);
    expect(resultEmailPattern("  ")).toBeNull();
  });
});
