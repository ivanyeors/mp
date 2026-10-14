/**
 * Slice 10 — Order build snapshot for production fulfill.
 * Maps to .claude/PRD-template-linked-customisation/issues/10-order-build-snapshot-fulfill.md
 */
import { describe, it, expect } from "vitest";
import {
  buildResultOrderSnapshot,
  groupBuildLinesByRole,
  isResultOrderBuildSnapshot,
} from "@/lib/results/order-build-snapshot";

describe("slice 10 — order build snapshot", () => {
  const nameByItem = new Map([
    [10, "Default cover"],
    [11, "Premium protector"],
    [20, "Latex shred"],
    [30, "Customer cover"],
    [31, "Customer case"],
    [40, "Travel bag"],
  ]);

  const snapshot = buildResultOrderSnapshot({
    resultId: "res-1",
    productType: "bolster",
    assignedSize: null,
    assignedTier: null,
    assignedLength: "medium",
    fillingTemplateId: 7,
    fillingTemplateName: "Bolster medium firm",
    buildLines: [
      { item_id: 10, quantity: 1, role: "composed", category: "cover" },
      { item_id: 11, quantity: 1, role: "composed", category: "bolster_protector" },
      { item_id: 20, quantity: 3, role: "filling", category: "filling" },
      { item_id: 30, quantity: 1, role: "preference", category: "cover" },
      { item_id: 31, quantity: 1, role: "preference", category: "case" },
      { item_id: 40, quantity: 1, role: "addon" },
    ],
    nameByItem,
    cogs: 42,
    pricing: { goods: 140, services: 0, subtotal: 140, shipping: 8, tax: 12, total: 160 },
  });

  it("AC1: snapshot includes composed sellable, Filling Template, prefs, add-ons with names and quantities", () => {
    expect(snapshot.result_id).toBe("res-1");
    expect(snapshot.product_type).toBe("bolster");
    expect(snapshot.assigned_length).toBe("medium");
    expect(snapshot.filling_template_name).toBe("Bolster medium firm");
    expect(snapshot.build_lines.map((l) => [l.role, l.name, l.quantity])).toEqual([
      ["composed", "Default cover", 1],
      ["composed", "Premium protector", 1],
      ["filling", "Latex shred", 3],
      ["preference", "Customer cover", 1],
      ["preference", "Customer case", 1],
      ["addon", "Travel bag", 1],
    ]);
    expect(snapshot.preference_lines).toHaveLength(2);
    expect(snapshot.addon_lines).toHaveLength(1);
  });

  it("groups lines by role for production UI", () => {
    const groups = groupBuildLinesByRole(snapshot.build_lines);
    expect(groups.map((g) => g.role)).toEqual([
      "composed",
      "filling",
      "preference",
      "addon",
    ]);
    expect(groups.find((g) => g.role === "filling")?.lines[0]?.name).toBe("Latex shred");
  });

  it("type guard accepts Result snapshots and rejects legacy cart snapshots", () => {
    expect(isResultOrderBuildSnapshot(snapshot)).toBe(true);
    expect(
      isResultOrderBuildSnapshot({
        config_lines: [{ item_id: 1, quantity: 1, category: "cover", name: "x" }],
        summary: "legacy",
      }),
    ).toBe(false);
    expect(isResultOrderBuildSnapshot(null)).toBe(false);
  });

  it("falls back to Item #id when name is missing", () => {
    const bare = buildResultOrderSnapshot({
      resultId: "res-2",
      productType: "pillow",
      assignedSize: "M",
      assignedTier: "basic",
      assignedLength: null,
      fillingTemplateId: 1,
      fillingTemplateName: null,
      buildLines: [{ item_id: 99, quantity: 2, role: "filling", category: "filling" }],
      nameByItem: new Map(),
      cogs: 0,
      pricing: { goods: 0, services: 0, subtotal: 0, shipping: 0, tax: 0, total: 0 },
    });
    expect(bare.build_lines[0]?.name).toBe("Item #99");
  });
});
