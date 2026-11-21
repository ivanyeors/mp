import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  },
}));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: vi.fn() }));

const { repriceFromCostings, stripeSyncProblems } = await import("@/lib/shop/price-sync");

describe("stripeSyncProblems: the one place a Stripe sync result becomes problems", () => {
  const outcome = { pricesInPlace: false, notices: [], paymentLinkCleared: false };

  it("a sync that worked has none", () => {
    expect(stripeSyncProblems({ ...outcome, synced: true, pricesInPlace: true })).toEqual([]);
  });

  it("a sync that worked passes its notices on with no next step", () => {
    const notice = "Retired payment link plink_1: it sold a price no variant has any more.";
    expect(
      stripeSyncProblems({ ...outcome, synced: true, pricesInPlace: true, notices: [notice], paymentLinkCleared: true }),
    ).toEqual([{ message: notice }]);
  });

  it("a sync that failed says customers may pay the old price and points at Sync to Stripe", () => {
    expect(stripeSyncProblems({ ...outcome, synced: false, error: "Rate limit exceeded" })).toEqual([
      {
        message: "Couldn't sync to Stripe, so customers may still be charged the old price: Rate limit exceeded",
        next: { kind: "sync-to-stripe" },
      },
    ]);
  });

  it("prices in place but Stripe housekeeping failed: Stripe's message and the notices, no old-price claim, no Sync to Stripe", () => {
    const error = "The new prices are in place, but Stripe needs attention: old price price_1 is still active and needs archiving in Stripe (boom)";
    const problems = stripeSyncProblems({
      ...outcome,
      synced: false,
      error,
      pricesInPlace: true,
      notices: ["Retired payment link plink_1."],
      paymentLinkCleared: true,
    });
    expect(problems).toEqual([{ message: "Retired payment link plink_1." }, { message: error }]);
    expect(problems.some((p) => p.next)).toBe(false);
    expect(problems.some((p) => p.message.includes("old price:"))).toBe(false);
  });
});

describe("repriceFromCostings", () => {
  it("turns a thrown error into a warning that names the product and points at Resync prices", async () => {
    await expect(repriceFromCostings({ id: "p1", name: "Ear Pad" })).resolves.toEqual([
      {
        product: "Ear Pad",
        message: "Couldn't update its prices from Costings: SUPABASE_SERVICE_ROLE_KEY is not set",
        next: "Use Resync prices in Products to try again.",
      },
    ]);
  });
});
