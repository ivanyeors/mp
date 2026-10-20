import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * linkCustomerToAuthUser runs the Claim after the link, for every decision
 * type (PRD-shopify-customer-migration slice 05), and only for a row the
 * signed-in user owns. It stays the only path that binds a login.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb, claims: [] as string[] }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/customer-migration/claim", () => ({
  claimOnSignIn: vi.fn(async (customer: { id: string }) => {
    h.claims.push(customer.id);
    return { claimed: false, voucherIssued: false, welcomeEmailDue: false };
  }),
}));

const { linkCustomerToAuthUser } = await import("@/lib/auth/customer-identity");

const user = (id: string, email: string) => ({ id, email, user_metadata: {} }) as unknown as User;

beforeEach(() => {
  h.claims = [];
  h.db = { customers: [], orders: [] };
});

describe("linkCustomerToAuthUser → the Claim", () => {
  it("already_linked: claims (someone who signed in before the Claim shipped)", async () => {
    h.db.customers.push({ id: "c1", email: "a@example.com", auth_user_id: "u1" });
    await linkCustomerToAuthUser(user("u1", "a@example.com"));
    expect(h.claims).toEqual(["c1"]);
  });

  it("link_existing: binds the imported row, then claims it", async () => {
    h.db.customers.push({ id: "c2", email: "b@example.com", auth_user_id: null });
    const customer = await linkCustomerToAuthUser(user("u2", "B@Example.com"));
    expect(customer.auth_user_id).toBe("u2");
    expect(h.claims).toEqual(["c2"]);
  });

  it("create: claims too (a no-op for a new row)", async () => {
    const customer = await linkCustomerToAuthUser(user("u3", "new@example.com"));
    expect(h.claims).toEqual([customer.id]);
  });

  it("never claims a row another login holds", async () => {
    h.db.customers.push({ id: "c4", email: "d@example.com", auth_user_id: "someone-else" });
    await linkCustomerToAuthUser(user("u4", "d@example.com"));
    expect(h.claims).toEqual([]);
  });
});
