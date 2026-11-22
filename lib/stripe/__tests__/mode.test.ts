import { afterEach, describe, expect, it, vi } from "vitest";

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
    const live = await withKeys("sk_live_abc", "pk_test_abc");
    expect(live.stripeMode()).toBe("live");
    const unset = await withKeys(undefined, "pk_live_abc");
    expect(unset.stripeMode()).toBe("test");
  });

  it("refuses to guess in the browser", async () => {
    const m = await withKeys("sk_live_abc");
    vi.stubGlobal("window", {});
    try {
      expect(() => m.stripeMode()).toThrow(/server-only/);
      expect(m.stripeProductIdOf(PRODUCT, "live")).toBe("prod_live");
      expect(m.stripePriceIdOf(SANDBOX, "test")).toBe("price_sandbox");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("defaults to test when nothing is configured", async () => {
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
    const m = await withKeys("sk_live_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: null, stripe_price_id_test: "price_sandbox" })).toBeNull();
    expect(m.stripeProductIdOf({ stripe_product_id: null, stripe_product_id_test: "prod_sandbox" })).toBeNull();
  });

  it("falls back to the legacy column when the migration has not run", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: "price_sandbox" })).toBe("price_sandbox");
    expect(m.stripeProductIdOf({ stripe_product_id: "prod_sandbox" })).toBe("prod_sandbox");
  });

  it("does NOT fall back once the column exists but is empty", async () => {
    const m = await withKeys("sk_test_abc");
    expect(
      m.stripePriceIdOf({ stripe_price_id: "price_live", stripe_price_id_test: null }),
    ).toBeNull();
  });

  it("never falls back in live mode", async () => {
    const m = await withKeys("sk_live_abc");
    expect(m.stripePriceIdOf({ stripe_price_id: null, stripe_price_id_test: "price_sandbox" })).toBeNull();
  });

  it("payment link: each mode reads only its own columns, migration applied or not", async () => {
    const m = await withKeys("sk_test_abc");
    const both = {
      stripe_payment_link: "https://buy.stripe.com/live",
      stripe_payment_link_id: "plink_live",
      stripe_payment_link_test: "https://buy.stripe.com/test_x",
      stripe_payment_link_id_test: "plink_sandbox",
    };
    expect(m.stripePaymentLinkIdOf(both)).toBe("plink_sandbox");
    expect(m.stripePaymentLinkUrlOf(both)).toBe("https://buy.stripe.com/test_x");
    expect(m.stripePaymentLinkIdOf(both, "live")).toBe("plink_live");
    expect(m.stripePaymentLinkUrlOf(both, "live")).toBe("https://buy.stripe.com/live");

    const liveOnly = { stripe_payment_link: "https://buy.stripe.com/live", stripe_payment_link_id: "plink_live" };
    expect(m.stripePaymentLinkIdOf(liveOnly)).toBeNull();
    expect(m.stripePaymentLinkUrlOf(liveOnly)).toBeNull();
    expect(m.stripePaymentLinkIdOf({ ...liveOnly, stripe_payment_link_id_test: null })).toBeNull();
    expect(m.hasPaymentLinkColumns(liveOnly)).toBe(false);
    expect(m.hasPaymentLinkColumns({ ...liveOnly, stripe_payment_link_id_test: null })).toBe(true);
    expect(m.hasPaymentLinkColumns(liveOnly, "live")).toBe(true);

    const sandboxOnly = { stripe_payment_link_test: "https://buy.stripe.com/test_x", stripe_payment_link_id_test: "plink_sandbox" };
    expect(m.stripePaymentLinkIdOf(sandboxOnly, "live")).toBeNull();
    expect(m.stripePaymentLinkUrlOf(null)).toBeNull();
  });

  it("payment link columns follow the key", async () => {
    const test = await withKeys("sk_test_abc");
    expect(test.stripePaymentLinkColumns()).toEqual({
      url: "stripe_payment_link_test",
      id: "stripe_payment_link_id_test",
    });
    const live = await withKeys("sk_live_abc");
    expect(live.stripePaymentLinkColumns()).toEqual({
      url: "stripe_payment_link",
      id: "stripe_payment_link_id",
    });
    expect(live.stripePaymentLinkIdOf({ stripe_payment_link_id: "plink_live" })).toBe("plink_live");
  });

  it("tolerates a missing row", async () => {
    const m = await withKeys("sk_test_abc");
    expect(m.stripePriceIdOf(null)).toBeNull();
    expect(m.stripeProductIdOf(undefined)).toBeNull();
  });
});
