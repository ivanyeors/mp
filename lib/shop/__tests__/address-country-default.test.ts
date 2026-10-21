import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * A new address is Singaporean unless it says otherwise (PRD-shopify-customer-
 * migration slice 03, trap 3c). 'MY' was the default in four places; the
 * database's is asserted in supabase/tests/customer-import/assert-defaults.sql,
 * and the other three are here. Existing rows keep their country.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve({ id: "auth-owner", email: "owner@x.test" }),
  getAuthIdentity: () => Promise.resolve({ id: "auth-owner", email: "owner@x.test" }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { AddressInputSchema } = await import("@/lib/shop/customer-addresses");
const addresses = await import("@/app/api/shop/customers/[id]/addresses/route");

const ADDRESS = { recipient: "Ana Tan", line1: "1 Road", city: "Singapore", postal_code: "123456" };

beforeEach(() => {
  h.db = {
    admin_roles: [{ id: "owner", key: "owner", name: "Owner", is_system: true, grants_all: true, permissions: [] }],
    admin_users: [{ id: "m-owner", email: "owner@x.test", role_id: "owner", is_active: true, auth_user_id: "auth-owner" }],
    customers: [{ id: "c1", email: "ana@x.test" }],
    customer_addresses: [],
  };
});

describe("the country default is SG", () => {
  it("in the customer's own address schema", () => {
    expect(AddressInputSchema.parse(ADDRESS).country).toBe("SG");
    expect(AddressInputSchema.parse({ ...ADDRESS, country: "MY" }).country).toBe("MY");
  });

  it("in the Staff route's schema, all the way to the row it writes", async () => {
    const res = await addresses.POST(
      new Request("https://x.test/api/shop/customers/c1/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ADDRESS),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    expect(h.db.customer_addresses).toEqual([expect.objectContaining({ customer_id: "c1", country: "SG" })]);
  });

  it("in the account address form, which always sends its starting value", () => {
    const src = readFileSync(join(process.cwd(), "app/[lang]/account/addresses/addresses-client.tsx"), "utf8");
    const emptyForm = src.slice(src.indexOf("function emptyForm"), src.indexOf("function toForm"));
    expect(emptyForm).toMatch(/country: "SG"/);
    expect(src).not.toMatch(/"MY"/);
  });

  it("in the database, by migration", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261020110100_customer_addresses_country_sg.sql"),
      "utf8",
    );
    expect(sql).toMatch(/alter table public\.customer_addresses alter column country set default 'SG';/);
    expect(sql).not.toMatch(/\bupdate\b/i);
  });
});
