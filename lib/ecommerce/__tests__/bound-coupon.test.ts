import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * A coupon bound to a Customer (the Welcome-back voucher, ADR 0028 g) is valid
 * only for that Customer, signed in, checking out with their own email. A
 * coupon with no owner is a bearer code, unchanged.
 */

const h = vi.hoisted(() => ({ db: {} as FakeDb }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { BOUND_COUPON_ERROR, mayUseBoundCoupon, validateCoupon } = await import(
  "@/lib/ecommerce/discounts"
);

const OWNER = "cust-owner";
const OTHER = "cust-other";

const voucher = {
  id: "coupon-wb",
  code: "WB-7KQ4MZP2XH",
  discount_type: "fixed_amount",
  discount_value: 20,
  currency: "SGD",
  min_order_amount: 50,
  max_discount: null,
  usage_limit: 1,
  usage_count: 0,
  per_customer_limit: 1,
  starts_at: null,
  expires_at: "2099-01-01T00:00:00.000Z",
  applies_to: null,
  is_active: true,
  customer_id: OWNER,
  issued_for: "welcome_back",
};

beforeEach(() => {
  h.db = {
    coupons: [
      { ...voucher },
      {
        ...voucher,
        id: "coupon-bearer",
        code: "STAFF10",
        discount_type: "percentage",
        discount_value: 10,
        min_order_amount: null,
        usage_limit: null,
        per_customer_limit: null,
        customer_id: null,
        issued_for: null,
      },
    ],
    customers: [
      { id: OWNER, email: "wei.ling@example.com" },
      { id: OTHER, email: "someone@example.com" },
    ],
    orders: [],
  };
});

const session = (id: string | null) => vi.fn(async () => id);

describe("mayUseBoundCoupon", () => {
  it.each([
    ["no owner: a bearer code", null, null, null, true],
    ["no owner, signed in", null, OTHER, OTHER, true],
    ["guest", OWNER, null, OWNER, false],
    ["a different signed-in Customer", OWNER, OTHER, OTHER, false],
    ["a different Customer typing the owner's email", OWNER, OTHER, OWNER, false],
    ["the owner, under a different email", OWNER, OWNER, OTHER, false],
    ["the owner, under an email with no Customer", OWNER, OWNER, null, false],
    ["the owner, with their own email", OWNER, OWNER, OWNER, true],
  ] as const)("%s → %s", (_case, couponCustomerId, sessionCustomerId, emailCustomerId, ok) => {
    expect(mayUseBoundCoupon(couponCustomerId, { sessionCustomerId, emailCustomerId })).toBe(ok);
  });
});

describe("validateCoupon: a bound coupon", () => {
  it.each([
    ["a guest, with the owner's email", null, "wei.ling@example.com"],
    ["a guest, with no email", null, undefined],
    ["a different signed-in Customer, with their own email", OTHER, "someone@example.com"],
    ["a different signed-in Customer, with the owner's email", OTHER, "wei.ling@example.com"],
    ["the owner, checking out under a different Customer's email", OWNER, "someone@example.com"],
    ["the owner, checking out under an unknown email", OWNER, "new@example.com"],
    ["the owner, with no email yet", OWNER, undefined],
  ])("refuses %s", async (_case, signedIn, email) => {
    const result = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: email,
      getSessionCustomerId: session(signedIn),
    });
    expect(result).toEqual({ valid: false, error: BOUND_COUPON_ERROR });
  });

  it("accepts the owner with their own email, as typed (case and spaces)", async () => {
    const result = await validateCoupon("wb-7kq4mzp2xh", 100, undefined, undefined, {
      customerEmail: "  Wei.Ling@Example.com ",
      getSessionCustomerId: session(OWNER),
    });
    expect(result).toMatchObject({ valid: true, discount_amount: 20 });
  });

  it("accepts the owner when checkout passes the Customer its email resolved to", async () => {
    const result = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: "wei.ling@example.com",
      customerId: OWNER,
      getSessionCustomerId: session(OWNER),
    });
    expect(result).toMatchObject({ valid: true, discount_amount: 20 });
  });

  it("refuses the owner when checkout's email resolved to someone else", async () => {
    const result = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: "someone@example.com",
      customerId: OTHER,
      getSessionCustomerId: session(OWNER),
    });
    expect(result).toEqual({ valid: false, error: BOUND_COUPON_ERROR });
  });

  it("tells a stranger nothing about the voucher, not even that it expired", async () => {
    (h.db.coupons[0] as { expires_at: string }).expires_at = "2000-01-01T00:00:00.000Z";
    const stranger = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: "someone@example.com",
      getSessionCustomerId: session(OTHER),
    });
    expect(stranger.error).toBe(BOUND_COUPON_ERROR);
    const owner = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: "wei.ling@example.com",
      getSessionCustomerId: session(OWNER),
    });
    expect(owner.error).toBe("Coupon has expired");
  });

  it("keeps the rest of the rules for the owner: minimum spend, one use", async () => {
    const owner = { customerEmail: "wei.ling@example.com", getSessionCustomerId: session(OWNER) };
    expect((await validateCoupon("WB-7KQ4MZP2XH", 40, undefined, undefined, owner)).error).toBe(
      "Minimum order amount is SGD 50.00",
    );
    h.db.orders.push({
      id: "o1",
      coupon_id: "coupon-wb",
      customer_id: OWNER,
      email: "wei.ling@example.com",
      status: "paid",
      paid_at: "2026-10-21T00:00:00.000Z",
    });
    expect((await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, owner)).error).toBe(
      "You have already used this coupon the maximum number of times",
    );
  });

  it("is refused when no session resolver is passed at all", async () => {
    const result = await validateCoupon("WB-7KQ4MZP2XH", 100, undefined, undefined, {
      customerEmail: "wei.ling@example.com",
    });
    expect(result.error).toBe(BOUND_COUPON_ERROR);
  });
});

describe("validateCoupon: a bearer coupon is unchanged", () => {
  it("never resolves the session", async () => {
    const getSessionCustomerId = session(null);
    const result = await validateCoupon("STAFF10", 100, undefined, undefined, {
      customerEmail: "anyone@example.com",
      getSessionCustomerId,
    });
    expect(result).toMatchObject({ valid: true, discount_amount: 10 });
    expect(getSessionCustomerId).not.toHaveBeenCalled();
  });

  it("is valid for a guest", async () => {
    expect((await validateCoupon("STAFF10", 100)).valid).toBe(true);
  });
});
