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

  it("ignores the publishable key — the secret key is the account in use", async () => {
    // The publishable key is optional (hosted Checkout needs none), so it cannot
    // decide which column the admin reads. Reading it made a live deploy with a blank
    // or stale publishable key show every synced product as "Not synced".
    const live = await withKeys("sk_live_abc", "pk_test_abc");
    expect(live.stripeMode()).toBe("live");
    const unset = await withKeys(undefined, "pk_live_abc");
    expect(unset.stripeMode()).toBe("test");
  });

  it("refuses to guess in the browser", async () => {
    // A client component must be handed the mode by its server page.
    const m = await withKeys("sk_live_abc");
    vi.stubGlobal("window", {});
    try {
      expect(() => m.stripeMode()).toThrow(/server-only/);
      // An explicit mode is fine in the browser.
      expect(m.stripeProductIdOf(PRODUCT, "live")).toBe("prod_live");
      expect(m.stripePriceIdOf(SANDBOX, "test")).toBe("price_sandbox");
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("falls back to the legacy column when the migration has not run", async () => {
    // A `select("*")` against a database without 20260913120000 simply omits the
    // column, so the field is undefined rather than null. That is a deploy ahead of
    // its migration -- and before it, the legacy column holds the SANDBOX ids test
    // mode is asking for. Refusing here took shop checkout down for every item.
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: "price_sandbox" })).toBe("price_sandbox");
    expect(m.stripeProductIdOf({ stripe_product_id: "prod_sandbox" })).toBe("prod_sandbox");
  });

  it("does NOT fall back once the column exists but is empty", async () => {
    // Column present and null is a real answer: this product is not linked in this
    // account. Falling through would hand Stripe the other account's id.
    const m = await withKeys("sk_test_abc");
    expect(
      m.stripePriceIdOf({ stripe_price_id: "price_live", stripe_price_id_test: null }),
    ).toBeNull();
  });

  it("never falls back in live mode", async () => {
    const m = await withKeys("sk_live_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: null, stripe_price_id_test: "price_sandbox" })).toBeNull();
  });

  it("tolerates a missing row", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf(null)).toBeNull();
    expect(m.stripeProductIdOf(undefined)).toBeNull();
  });
});
