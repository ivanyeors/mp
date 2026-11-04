/**
 * Premium pricing: a Cervical Neck Support placed in the pillow is in the
 * pillow's MSRP, and an Ear Comfort Pad add-on is charged on top (owner,
 * 4-11-2026). Driven through `loadAssignedBuild`, the money path behind finish,
 * request-payment, reorder and Staff re-configure, so the rule is pinned where
 * the money is taken, not only in the pure function.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PillowPlacementRow } from "@/lib/spatial-fillings";
import { loadAssignedBuild, type AssignedBuildRow } from "../assigned-build";

const PROTECTOR = 11;
const FILL_6D = 55;
const NECK_S = 61;
const EAR_PAD = 41;

const PREMIUM_S_MSRP = 360;
const EAR_PAD_MSRP = 60;

vi.mock("@/lib/results/composed-sellable", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/composed-sellable")>()),
  loadComposedSellable: async () => ({
    ok: true,
    sellable: {
      bomLines: [{ item_id: PROTECTOR, quantity: 1, category: "pillow_protector" }],
      msrp: PREMIUM_S_MSRP,
      priceFault: null,
      msrpByFamily: { "": PREMIUM_S_MSRP },
      defaultCover: null,
      defaultCase: null,
      caseOptions: [],
      coverOptions: [],
      currency: "SGD",
    },
  }),
}));

vi.mock("@/lib/pricing/service-lines", async (orig) => ({
  ...(await orig<typeof import("@/lib/pricing/service-lines")>()),
  loadResultServiceLines: async () => [],
}));

const ITEMS = [
  { id: PROTECTOR, name: "Waterproof Inner", subtype: null, category: "pillow_protector", price_family: null },
  { id: FILL_6D, name: "6D", subtype: null, category: "filling", price_family: null },
  { id: NECK_S, name: "Cervical Neck Support", subtype: null, category: "accessories", price_family: null },
  { id: EAR_PAD, name: "Ear Comfort Pad", subtype: null, category: "accessories", price_family: null },
];
const PRICES = [
  { item_id: PROTECTOR, msrp: 40, cost_price: 6 },
  { item_id: FILL_6D, msrp: 12, cost_price: 3 },
  { item_id: NECK_S, msrp: 38, cost_price: 9 },
  { item_id: EAR_PAD, msrp: EAR_PAD_MSRP, cost_price: 15 },
];

/** Answers `from(table).select(...).in("id"|"item_id", ids)` from the rows above. */
function fakeAdmin(): SupabaseClient {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    items: ITEMS,
    item_prices: PRICES,
    inventory_balances: ITEMS.map((i) => ({ item_id: i.id, on_hand: 50 })),
  };
  return {
    from: (table: string) => ({
      select: () => ({
        in: async (column: string, ids: number[]) => ({
          data: (tables[table] ?? []).filter((r) => ids.includes(r[column] as number)),
          error: null,
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const at = (slot: number, item_id: number): PillowPlacementRow => ({
  section: "center",
  sub_section: "front",
  slot,
  item_id,
});

const row = (addons: number[]): AssignedBuildRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  product_type: "pillow",
  assigned_size: "S",
  assigned_tier: "premium",
  assigned_length: null,
  filling_template_id: null,
  preference_lines: [],
  addon_lines: addons.map((item_id) => ({ item_id, quantity: 1 })),
  shipping_method: null,
  shipping_address: null,
  shipping_rate: null,
  currency: "SGD",
  measured_by_type: null,
  coupon_terms: null,
});

const withNeck = [at(1, FILL_6D), at(2, FILL_6D), at(3, NECK_S)];
const withoutNeck = [at(1, FILL_6D), at(2, FILL_6D)];

async function build(placements: PillowPlacementRow[], addons: number[] = []) {
  const result = await loadAssignedBuild(fakeAdmin(), row(addons), { fillingPlacements: placements });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("premium pricing: neck support inside, ear pad on top", () => {
  beforeEach(() => vi.clearAllMocks());

  it("charges the pillow's MSRP with a neck support placed, nothing on top", async () => {
    expect((await build(withNeck)).pricing.goods).toBe(PREMIUM_S_MSRP);
  });

  it("keeps the pillow's MSRP when the neck support is taken out", async () => {
    expect((await build(withoutNeck)).pricing.goods).toBe(PREMIUM_S_MSRP);
  });

  it("charges an Ear Comfort Pad add-on at its MSRP, neck support or not", async () => {
    expect((await build(withNeck, [EAR_PAD])).pricing.goods).toBe(PREMIUM_S_MSRP + EAR_PAD_MSRP);
    expect((await build(withoutNeck, [EAR_PAD])).pricing.goods).toBe(PREMIUM_S_MSRP + EAR_PAD_MSRP);
  });

  it("still ships the neck support: a filling line, out of stock and into COGS", async () => {
    const assembled = await build(withNeck);
    expect(assembled.lines).toContainEqual(
      expect.objectContaining({ item_id: NECK_S, quantity: 1, role: "filling" }),
    );
    // Protector 6 + two 6D at 3 + neck support 9.
    expect(assembled.cogs).toBe(21);
    expect((await build(withoutNeck)).cogs).toBe(12);
  });
});
