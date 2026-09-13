import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The mode is derived from the key rather than configured, so these tests set the
 * key and assert the column follows. A flag that could disagree with the key in use
 * would mean reading one account's ids while charging another's.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.resetModules();
});

async function withKeys(secret?: string, publishable?: string) {
  vi.resetModules();
  process.env = { ...ENV };
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (secret) process.env.STRIPE_SECRET_KEY = secret;
  if (publishable) process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = publishable;
  return import("@/lib/stripe/mode");
}

const SANDBOX = { stripe_price_id: "price_live", stripe_price_id_test: "price_sandbox" };
const PRODUCT = { stripe_product_id: "prod_live", stripe_product_id_test: "prod_sandbox" };

describe("stripeMode", () => {
  it("reads test from a test secret key", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripeMode()).toBe("test");
  });

  it("reads live from a live secret key", async () => {
    const m = await withKeys("sk_live_abc");
    expect(m.stripeMode()).toBe("live");
  });

  it("recognises a restricted test key", async () => {
    const m = await withKeys("rk_test_abc");
    expect(m.stripeMode()).toBe("test");
  });

  it("falls back to the publishable key, which is all the browser has", async () => {
    // Next replaces STRIPE_SECRET_KEY with undefined in the client bundle, so the
    // admin's "linked to Stripe" badge would otherwise always read live.
    const m = await withKeys(undefined, "pk_test_abc");
    expect(m.stripeMode()).toBe("test");
  });

  it("defaults to test when nothing is configured", async () => {
    // An unconfigured environment must not reach for live ids.
    const m = await withKeys();
    expect(m.stripeMode()).toBe("test");
  });
});

describe("id resolution", () => {
  it("picks the sandbox id under a test key", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf(SANDBOX)).toBe("price_sandbox");
    expect(m.stripeProductIdOf(PRODUCT)).toBe("prod_sandbox");
    expect(m.stripePriceIdColumn()).toBe("stripe_price_id_test");
    expect(m.stripeProductIdColumn()).toBe("stripe_product_id_test");
  });

  it("picks the live id under a live key", async () => {
    const m = await withKeys("sk_live_abc");
    expect(m.stripePriceIdOf(SANDBOX)).toBe("price_live");
    expect(m.stripeProductIdOf(PRODUCT)).toBe("prod_live");
    expect(m.stripePriceIdColumn()).toBe("stripe_price_id");
    expect(m.stripeProductIdColumn()).toBe("stripe_product_id");
  });

  it("is null — not the other account's id — when this account has none", async () => {
    // The live account is empty until its first sync. Falling back to the sandbox id
    // here would hand Stripe a Price from an account it cannot see, mid-checkout.
    const m = await withKeys("sk_live_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: null, stripe_price_id_test: "price_sandbox" })).toBeNull();
    expect(m.stripeProductIdOf({ stripe_product_id: null, stripe_product_id_test: "prod_sandbox" })).toBeNull();
  });

  it("tolerates a missing row", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf(null)).toBeNull();
    expect(m.stripeProductIdOf(undefined)).toBeNull();
  });
});
