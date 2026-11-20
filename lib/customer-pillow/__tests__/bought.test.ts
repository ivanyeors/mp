import { describe, expect, it } from "vitest";
import { boughtPillows, pillowOwnership, snapshotPillowBuild } from "../bought";

const cell = (slot: number, itemId: number, extra: Record<string, unknown> = {}) => ({
  section: "center",
  sub_section: "middle",
  slot,
  item_id: itemId,
  row_index: null,
  insert_order: slot,
  ...extra,
});

const snapshot = (over: Record<string, unknown> = {}) => ({
  result_id: "res-1",
  product_type: "pillow",
  assigned_size: "M",
  assigned_tier: "premium",
  filling_template_id: 57,
  filling_template_name: "Type-12",
  filling_placements: [cell(1, 67), cell(2, 68)],
  build_lines: [],
  ...over,
});

describe("snapshotPillowBuild", () => {
  it("reads a Result pillow line's template and cells", () => {
    expect(snapshotPillowBuild(snapshot())).toEqual({
      resultId: "res-1",
      templateId: 57,
      templateName: "Type-12",
      placements: [
        { section: "center", sub_section: "middle", slot: 1, item_id: 67, row_index: null, insert_order: 1, offset_x_mm: null, offset_y_mm: null },
        { section: "center", sub_section: "middle", slot: 2, item_id: 68, row_index: null, insert_order: 2, offset_x_mm: null, offset_y_mm: null },
      ],
    });
  });

  it("keeps a custom mix, with no template", () => {
    expect(snapshotPillowBuild(snapshot({ filling_template_id: null, filling_template_name: null }))).toMatchObject({
      templateId: null,
      templateName: null,
    });
  });

  it("drops a row that is not a pillow cell", () => {
    const build = snapshotPillowBuild(snapshot({ filling_placements: [cell(1, 67), { slot: 2, item_id: 9 }, { section: "left" }, null] }));
    expect(build?.placements.map((p) => p.item_id)).toEqual([67]);
  });

  it("holds nothing for a bolster, a line not from a Result, or no snapshot", () => {
    expect(snapshotPillowBuild(snapshot({ product_type: "bolster" }))).toBeNull();
    expect(snapshotPillowBuild({ product_type: "pillow", pillow_product_id: 3 })).toBeNull();
    expect(snapshotPillowBuild(null)).toBeNull();
  });

  it("has no cells for a Result from before spatial builds", () => {
    expect(snapshotPillowBuild(snapshot({ filling_placements: undefined }))?.placements).toEqual([]);
  });
});

describe("boughtPillows", () => {
  const line = (id: string, paidAt: string, size = "M") => ({ order_id: `o-${id}`, order_item_id: `i-${id}`, paid_at: paidAt, size });
  const item = (id: string, over: Record<string, unknown> = {}) => ({
    id: `i-${id}`,
    quantity: 1,
    returned_quantity: 0,
    customization_snapshot: snapshot(),
    ...over,
  });

  it("lists what they still have, latest first", () => {
    const bought = boughtPillows(
      [line("a", "2026-09-01T00:00:00Z", "S"), line("b", "2026-10-01T00:00:00Z", "L")],
      [item("a"), item("b")],
    );
    expect(bought.map((b) => [b.orderItemId, b.size])).toEqual([
      ["i-b", "L"],
      ["i-a", "S"],
    ]);
  });

  it("leaves out a pillow they returned, and a line whose item is missing", () => {
    expect(
      boughtPillows(
        [line("a", "2026-09-01T00:00:00Z"), line("b", "2026-10-01T00:00:00Z")],
        [item("a", { returned_quantity: 1 })],
      ),
    ).toEqual([]);
  });

  it("still counts a pillow whose line froze no build", () => {
    const [b] = boughtPillows([line("a", "2026-09-01T00:00:00Z")], [item("a", { customization_snapshot: { pillow_product_id: 4 } })]);
    expect(b).toMatchObject({ orderId: "o-a", templateId: null, placements: [] });
  });
});

describe("pillowOwnership", () => {
  const none = { boughtHere: false, linked: false, shopifyOrders: null, fittings: 0 };

  it("is a pillow bought here, a Staff link, or a fitting with a Shopify order", () => {
    expect(pillowOwnership({ ...none, boughtHere: true })).toBe("bought_here");
    expect(pillowOwnership({ ...none, linked: true })).toBe("linked");
    expect(pillowOwnership({ ...none, shopifyOrders: 2, fittings: 1 })).toBe("shopify_fitting");
  });

  it("is nothing for a fitting alone, Shopify orders alone, or an import with no orders", () => {
    expect(pillowOwnership(none)).toBeNull();
    expect(pillowOwnership({ ...none, fittings: 3 })).toBeNull();
    expect(pillowOwnership({ ...none, shopifyOrders: 4 })).toBeNull();
    expect(pillowOwnership({ ...none, shopifyOrders: 0, fittings: 1 })).toBeNull();
  });
});
