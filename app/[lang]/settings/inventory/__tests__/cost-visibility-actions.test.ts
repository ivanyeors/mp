import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionsForRole, type AdminRole } from "@/lib/auth/permissions";

type Row = Record<string, unknown>;
type Answer = { data: unknown; error: { code?: string; message: string } | null };

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  itemPrices: new Map<number, Row>(),
  upserts: [] as Row[],
  inserts: [] as Row[],
  inactiveDuplicate: null as { id: number } | null,
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions };
  }),
  assertAnyAdmin: vi.fn(),
}));

vi.mock("@/lib/ecommerce/shop-listings", () => ({
  listInventoryFamilies: vi.fn(async () => [
    {
      key: "cover\u0000Silk",
      category: "cover",
      name: "Silk",
      title: "Silk Cover",
      sizes: [{ itemId: 1, size: "M", costCents: 1250, msrpCents: 3900, productId: null }],
      push: "new",
      productId: null,
      productSlug: null,
      productStatus: null,
    },
  ]),
}));

function answer(table: string, op: string, payload: Row | null): Answer {
  if (table === "item_prices" && op === "select") return { data: [...h.itemPrices.values()], error: null };
  if (table === "item_prices" && op === "upsert") {
    const row = payload!;
    h.upserts.push(row);
    const id = Number(row.item_id);
    h.itemPrices.set(id, { ...(h.itemPrices.get(id) ?? {}), ...row });
    return { data: null, error: null };
  }
  if (table === "items" && op === "insert") {
    h.inserts.push(payload!);
    if (h.inactiveDuplicate) return { data: null, error: { code: "23505", message: "duplicate key" } };
    return { data: { id: 42, ...payload }, error: null };
  }
  if (table === "items" && op === "select") return { data: { id: h.inactiveDuplicate?.id, is_active: false }, error: null };
  if (table === "items" && op === "update") return { data: { id: h.inactiveDuplicate?.id, category: "cover" }, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let op = "select";
      let payload: Row | null = null;
      const write = (kind: string) => (row: Row) => {
        op = kind;
        payload = row;
        return q;
      };
      const settle = async () => answer(table, op, payload);
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        insert: write("insert"),
        update: write("update"),
        upsert: write("upsert"),
        single: settle,
        maybeSingle: settle,
        then: (resolve: (v: Answer) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject),
      };
      return q;
    },
  }),
}));

const { addInventoryItem, getInventoryCostingState } = await import("../actions");

const signInAs = (role: AdminRole) => {
  h.permissions = new Set(permissionsForRole(role));
};

beforeEach(() => {
  h.itemPrices = new Map([
    [1, { item_id: 1, cost_price: "12.50", msrp: "39.00" }],
    [3, { item_id: 3, cost_price: null, msrp: "20.00" }],
  ]);
  h.upserts = [];
  h.inserts = [];
  h.inactiveDuplicate = null;
});

describe("a role with inventory but not costings (Staff)", () => {
  beforeEach(() => {
    signInAs("staff");
    expect(h.permissions.has("inventory")).toBe(true);
    expect(h.permissions.has("costings")).toBe(false);
  });

  it("gets no item cost from getInventoryCostingState, in prices or in families", async () => {
    const state = await getInventoryCostingState();
    expect(state.canSeeCost).toBe(false);
    expect(state.prices[1]).toEqual({ costCents: null, msrpCents: 3900, costHidden: true });
    expect(state.families[0]!.sizes[0]).toMatchObject({ costCents: null, msrpCents: 3900, costHidden: true });
    expect(JSON.stringify(state)).not.toContain("1250");
  });

  it("is told an item has no cost yet, so it can wait on Costings", async () => {
    const state = await getInventoryCostingState();
    expect(state.prices[3]).toEqual({ costCents: null, msrpCents: 2000 });
  });

  it("cannot set a cost on a new item, and nothing is written", async () => {
    await expect(
      addInventoryItem({ category: "cover", name: "Velvet", size: "M", initialStock: 0, costPrice: 8 }),
    ).rejects.toThrow("Only staff with Costings access can set a cost price.");
    expect(h.inserts).toEqual([]);
    expect(h.upserts).toEqual([]);
  });

  it("cannot set a zero cost either", async () => {
    await expect(
      addInventoryItem({ category: "cover", name: "Velvet", size: "M", initialStock: 0, costPrice: 0 }),
    ).rejects.toThrow("Only staff with Costings access can set a cost price.");
    expect(h.upserts).toEqual([]);
  });

  it("adds an item with an MSRP and writes no cost_price column", async () => {
    await addInventoryItem({ category: "cover", name: "Velvet", size: "M", initialStock: 0, msrp: 29 });
    expect(h.upserts).toEqual([{ item_id: 42, msrp: "29.00" }]);
    expect(Object.keys(h.upserts[0]!)).not.toContain("cost_price");
  });

  it("keeps the stored cost when it revives an item with a new MSRP", async () => {
    h.inactiveDuplicate = { id: 1 };
    await addInventoryItem({ category: "cover", name: "Silk", size: "M", initialStock: 0, msrp: 45 });
    expect(Object.keys(h.upserts[0]!)).not.toContain("cost_price");
    expect(h.itemPrices.get(1)).toEqual({ item_id: 1, cost_price: "12.50", msrp: "45.00" });
  });
});

describe("a role with inventory and costings (Manager) keeps today's behaviour", () => {
  beforeEach(() => {
    signInAs("manager");
    expect(h.permissions.has("costings")).toBe(true);
  });

  it("gets every item's cost", async () => {
    const state = await getInventoryCostingState();
    expect(state.canSeeCost).toBe(true);
    expect(state.prices[1]).toEqual({ costCents: 1250, msrpCents: 3900 });
    expect(state.families[0]!.sizes[0]).toMatchObject({ costCents: 1250, msrpCents: 3900 });
  });

  it("sets a cost and an MSRP on a new item", async () => {
    await addInventoryItem({ category: "cover", name: "Velvet", size: "M", initialStock: 0, costPrice: 8, msrp: 29 });
    expect(h.upserts).toEqual([{ item_id: 42, cost_price: "8.00", msrp: "29.00" }]);
  });

  it("writes cost_price as entered (none) beside an MSRP, as before", async () => {
    h.inactiveDuplicate = { id: 1 };
    await addInventoryItem({ category: "cover", name: "Silk", size: "M", initialStock: 0, msrp: 45 });
    expect(h.upserts).toEqual([{ item_id: 1, cost_price: null, msrp: "45.00" }]);
  });
});

describe("the owner sees cost", () => {
  it("gets every item's cost", async () => {
    signInAs("owner");
    const state = await getInventoryCostingState();
    expect(state.canSeeCost).toBe(true);
    expect(state.prices[1]!.costCents).toBe(1250);
  });
});
