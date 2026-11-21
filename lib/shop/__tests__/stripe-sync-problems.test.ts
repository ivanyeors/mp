import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  },
}));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: vi.fn() }));

const { repriceFromCostings, stripeSyncProblems } = await import("@/lib/shop/price-sync");

describe("stripeSyncProblems: the one place a Stripe sync result becomes problems", () => {
  it("a sync that worked has none", () => {
    expect(stripeSyncProblems({ synced: true })).toEqual([]);
  });

  it("a sync that failed says customers may pay the old price and points at Sync to Stripe", () => {
    expect(stripeSyncProblems({ synced: false, error: "Rate limit exceeded" })).toEqual([
      {
        message: "Couldn't sync to Stripe, so customers may still be charged the old price: Rate limit exceeded",
        next: { kind: "sync-to-stripe" },
      },
    ]);
  });
});

describe("repriceFromCostings", () => {
  it("turns a thrown error into a warning that names the product and the action to run again", async () => {
    await expect(repriceFromCostings({ id: "p1", name: "Ear Pad" }, "Add from Inventory")).resolves.toEqual([
      {
        product: "Ear Pad",
        message: "Couldn't update its prices from Costings: SUPABASE_SERVICE_ROLE_KEY is not set",
        next: "Try Add from Inventory again.",
      },
    ]);
  });
});
