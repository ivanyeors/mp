import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const f = await import("@/app/api/results/__tests__/paired-build.fakes");
  return { supabaseAdmin: () => f.fakeAdmin };
});

const f = await import("@/app/api/results/__tests__/paired-build.fakes");
const { deductOrderStock, deductStockWhenSold } = await import("@/lib/ecommerce/order-stock");
const { deductInventoryForOrder } = await import("@/lib/ecommerce/inventory-deduction");

type Admin = Parameters<typeof deductOrderStock>[0];
const admin = f.fakeAdmin as unknown as Admin;

const ORDER = "00000000-0000-4000-8000-0000000000a1";
const ACCESSORY_VARIANT = "00000000-0000-4000-8000-0000000000b1";
const BOLSTER_VARIANT = "00000000-0000-4000-8000-0000000000b2";

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  f.resetDb({
    orders: [{ id: ORDER, status: "pending", inventory_deducted_at: null, needs_attention: false }],
    order_items: [{ id: "line-1", order_id: ORDER, kind: "goods", variant_id: ACCESSORY_VARIANT, quantity: 2 }],
    product_variants: [
      { id: ACCESSORY_VARIANT, pillow_product_id: null, item_id: 900, track_inventory: true, stock_quantity: 0, option1: null },
      { id: BOLSTER_VARIANT, pillow_product_id: null, item_id: null, track_inventory: true, stock_quantity: 0, option1: "Medium" },
    ],
    items: [
      { id: 301, category: "cover" },
      { id: 302, category: "bolster_case" },
      { id: 303, category: "bolster_protector" },
      { id: 401, category: "filling" },
    ],
    bolster_bom_lines: [
      { variant: "medium", item_id: 301, quantity: 1 },
      { variant: "medium", item_id: 302, quantity: 1 },
      { variant: "medium", item_id: 303, quantity: 1 },
    ],
    bolster_length_config: [{ variant: "medium", default_filling_template_id: 77 }],
    bom_templates: [{ id: 77, kind: "bolster" }],
    bolster_template_placements: [
      { template_id: 77, item_id: 401 },
      { template_id: 77, item_id: 401 },
      { template_id: 77, item_id: 401 },
    ],
    bom_template_lines: [],
    ...extra,
  });
}

const sales = () => f.rows("inventory_transactions").filter((t) => t.reason === "sale");
const order = () => f.row("orders", ORDER)!;

beforeEach(() => seed());

describe("deductOrderStock", () => {
  it("deducts an Order's goods once and claims it", async () => {
    expect(await deductOrderStock(admin, ORDER)).toBe("deducted");
    expect(sales()).toEqual([
      expect.objectContaining({ item_id: 900, quantity_signed: -2, metadata: { order_id: ORDER } }),
    ]);
    expect(order().inventory_deducted_at).toBeTruthy();

    expect(await deductOrderStock(admin, ORDER)).toBe("already_deducted");
    expect(sales()).toHaveLength(1);
  });

  it("claims, without deducting again, an Order whose sale rows predate the claim", async () => {
    seed({
      inventory_transactions: [
        { id: 1, item_id: 900, quantity_signed: -2, reason: "sale", metadata: { order_id: ORDER } },
      ],
    });
    expect(await deductOrderStock(admin, ORDER)).toBe("already_deducted");
    expect(sales()).toHaveLength(1);
    expect(order().inventory_deducted_at).toBeTruthy();
  });

  it("hands the claim back when the ledger write fails, so a retry deducts", async () => {
    f.db.faults.push({ table: "inventory_transactions", op: "insert", error: { code: "XX000", message: "connection reset" } });
    await expect(deductOrderStock(admin, ORDER)).rejects.toThrow("connection reset");
    expect(order().inventory_deducted_at ?? null).toBeNull();

    expect(await deductOrderStock(admin, ORDER)).toBe("deducted");
    expect(sales()).toHaveLength(1);
  });

  it("takes nothing for a service line", async () => {
    seed({ order_items: [{ id: "svc", order_id: ORDER, kind: "service", variant_id: null, quantity: 1 }] });
    expect(await deductOrderStock(admin, ORDER)).toBe("deducted");
    expect(sales()).toEqual([]);
  });
});

describe("deductStockWhenSold", () => {
  it("deducts when an Order becomes sold, and never on a change between sold statuses", async () => {
    expect(await deductStockWhenSold(admin, ORDER, null, "pending")).toBeNull();
    expect(await deductStockWhenSold(admin, ORDER, "confirmed", "shipped")).toBeNull();
    expect(sales()).toEqual([]);

    expect(await deductStockWhenSold(admin, ORDER, "pending", "confirmed")).toEqual({ ok: true, result: "deducted" });
    expect(sales()).toHaveLength(1);
  });

  it("flags the Order with a timeline event when the deduction fails", async () => {
    f.db.faults.push({ table: "inventory_transactions", op: "insert", error: { code: "XX000", message: "connection reset" } });
    const res = await deductStockWhenSold(admin, ORDER, null, "delivered");
    expect(res).toEqual({ ok: false, error: "connection reset" });
    expect(order().needs_attention).toBe(true);
    expect(f.rows("order_timeline")).toEqual([
      expect.objectContaining({ order_id: ORDER, event_type: "stock_not_deducted" }),
    ]);
  });
});

describe("deductInventoryForOrder — a customised shop bolster", () => {
  const customised = (configLines: Array<Record<string, unknown>>) => ({
    variant_id: BOLSTER_VARIANT,
    quantity: 1,
    customization_id: "cfg-1",
    customization_snapshot: { product_type: "bolster", bolster_variant: "medium", config_lines: configLines, filling_lines: [] },
  });

  it("deducts the length's default fillings, which ship with it", async () => {
    await deductInventoryForOrder(ORDER, [customised([])], admin);
    const byItem = new Map(sales().map((t) => [t.item_id, t.quantity_signed]));
    expect(byItem).toEqual(new Map([[301, -1], [302, -1], [303, -1], [401, -3]]));
  });

  it("deducts the chosen cover instead of the recipe's, never both", async () => {
    await deductInventoryForOrder(ORDER, [customised([{ item_id: 305, quantity: 1, category: "cover" }])], admin);
    const items = sales().map((t) => t.item_id).sort();
    expect(items).toEqual([302, 303, 305, 401]);
  });
});
