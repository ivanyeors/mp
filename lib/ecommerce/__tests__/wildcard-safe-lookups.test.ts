import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * No lookup that decides money may read `%` or `_` from the caller as a
 * wildcard (#169). The Supabase mock evaluates ILIKE/eq against seeded rows, so
 * a wildcard that would match in Postgres matches here too.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { validateCoupon } = await import("@/lib/ecommerce/discounts");
const { findCustomerByEmail, findOrCreateCustomer } = await import("@/lib/ecommerce/customers");

function staff10(over: Record<string, unknown> = {}) {
  return {
    id: "coupon-staff10",
    code: "STAFF10",
    discount_type: "percentage",
    discount_value: 10,
    currency: "SGD",
    min_order_amount: null,
    max_discount: null,
    usage_limit: null,
    usage_count: 0,
    per_customer_limit: null,
    starts_at: null,
    expires_at: null,
    applies_to: null,
    is_active: true,
    ...over,
  };
}

beforeEach(() => {
  h.db = { coupons: [staff10()], orders: [], customers: [] };
});

describe("validateCoupon: code lookup is exact", () => {
  it.each(["%", "_", "STAFF%", "%10", "STAFF1_", "_______"])("rejects the pattern %j", async (code) => {
    const result = await validateCoupon(code, 100);
    expect(result.valid).toBe(false);
  });

  it("accepts the real code typed in lower case", async () => {
    const result = await validateCoupon("staff10", 100);
    expect(result).toMatchObject({ valid: true, discount_amount: 10 });
  });

  it("accepts the real code with surrounding whitespace", async () => {
    expect((await validateCoupon("  Staff10 ", 100)).valid).toBe(true);
  });
});

describe("validateCoupon: per-customer use count matches the email exactly", () => {
  it("does not count another customer's use when the email holds `_`", async () => {
    h.db.coupons = [staff10({ per_customer_limit: 1 })];
    h.db.orders = [
      { coupon_id: "coupon-staff10", email: "axb@x.com", status: "paid", paid_at: "2026-09-01T00:00:00Z" },
    ];
    const result = await validateCoupon("STAFF10", 100, undefined, undefined, {
      customerEmail: "a_b@x.com",
      account: { customerId: "cust-ab", email: "a_b@x.com" },
    });
    expect(result.valid).toBe(true);
  });

  it("still counts the customer's own prior use", async () => {
    h.db.coupons = [staff10({ per_customer_limit: 1 })];
    h.db.orders = [
      { coupon_id: "coupon-staff10", email: "a_b@x.com", status: "paid", paid_at: "2026-09-01T00:00:00Z" },
    ];
    const result = await validateCoupon("STAFF10", 100, undefined, undefined, {
      customerEmail: "A_B@x.com",
      account: { customerId: "cust-ab", email: "a_b@x.com" },
    });
    expect(result.valid).toBe(false);
  });
});

describe("checkout customer lookup matches the email exactly", () => {
  it("findCustomerByEmail: `a_b@x.com` does not match `axb@x.com`", async () => {
    h.db.customers = [{ id: "cust-axb", email: "axb@x.com" }];
    expect(await findCustomerByEmail("a_b@x.com")).toBeNull();
  });

  it("findCustomerByEmail: `%@x.com` matches nobody", async () => {
    h.db.customers = [{ id: "cust-axb", email: "axb@x.com" }];
    expect(await findCustomerByEmail("%@x.com")).toBeNull();
  });

  it("findCustomerByEmail: `a*b@x.com` does not match `axyzb@x.com`", async () => {
    h.db.customers = [{ id: "cust-axyzb", email: "axyzb@x.com" }];
    expect(await findCustomerByEmail("a*b@x.com")).toBeNull();
  });

  it("findCustomerByEmail: finds the real customer case-insensitively", async () => {
    h.db.customers = [{ id: "cust-ab", email: "a_b@x.com" }];
    expect((await findCustomerByEmail(" A_B@X.com "))?.id).toBe("cust-ab");
  });

  it("findOrCreateCustomer: a guest `a_b@x.com` never attaches to `axb@x.com`", async () => {
    h.db.customers = [{ id: "cust-axb", email: "axb@x.com" }];
    const customer = await findOrCreateCustomer("a_b@x.com");
    expect(customer.id).not.toBe("cust-axb");
    expect(customer.email).toBe("a_b@x.com");
    expect(h.db.customers).toHaveLength(2);
  });
});
