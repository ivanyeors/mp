import { describe, it, expect } from "vitest";
import { planRmaCreate, type PlanRmaInput } from "@/lib/rma/create";

const NOW = new Date("2026-07-23T12:00:00Z");

function base(overrides: Partial<PlanRmaInput> = {}): PlanRmaInput {
  return {
    order: { delivered_at: "2026-07-20T00:00:00Z", status: "delivered" },
    orderItems: [
      { id: "item-a", quantity: 2, product_title: "Memory Pillow" },
      { id: "item-b", quantity: 1, product_title: "Bolster" },
    ],
    alreadyReturnedByItem: {},
    requestedItems: [{ order_item_id: "item-a", quantity: 1 }],
    resolution: "refund",
    returnWindowDays: 30,
    now: NOW,
    ...overrides,
  };
}

describe("planRmaCreate (server-side eligibility re-check)", () => {
  it("plans rows for an eligible single line", () => {
    const r = planRmaCreate(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.items).toEqual([{ order_item_id: "item-a", quantity: 1 }]);
      expect(r.rows.emailItems).toEqual([{ title: "Memory Pillow", quantity: 1 }]);
    }
  });

  it("plans multiple eligible lines", () => {
    const r = planRmaCreate(
      base({
        requestedItems: [
          { order_item_id: "item-a", quantity: 2 },
          { order_item_id: "item-b", quantity: 1 },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows.items).toHaveLength(2);
  });

  it("rejects an empty request", () => {
    const r = planRmaCreate(base({ requestedItems: [] }));
    expect(r.ok).toBe(false);
  });

  it("rejects an item that is not on the order (cross-order guard)", () => {
    const r = planRmaCreate(
      base({ requestedItems: [{ order_item_id: "item-x", quantity: 1 }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not part of this order/i);
  });

  it("does NOT trust the client: rejects an undelivered order even if asked", () => {
    const r = planRmaCreate(
      base({ order: { delivered_at: null, status: "processing" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/delivered/i);
  });

  it("rejects past the return window", () => {
    const r = planRmaCreate(
      base({ order: { delivered_at: "2026-06-13T00:00:00Z", status: "delivered" } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/window closed/i);
  });

  it("rejects requesting more than remains after prior returns", () => {
    const r = planRmaCreate(
      base({
        alreadyReturnedByItem: { "item-a": 1 },
        requestedItems: [{ order_item_id: "item-a", quantity: 2 }],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/only 1/i);
  });

  it("caps by already-returned quantity even when the order is otherwise eligible", () => {
    const r = planRmaCreate(
      base({
        alreadyReturnedByItem: { "item-a": 2 },
        requestedItems: [{ order_item_id: "item-a", quantity: 1 }],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already part of a return/i);
  });

  it("rejects a duplicate item in the same request", () => {
    const r = planRmaCreate(
      base({
        requestedItems: [
          { order_item_id: "item-a", quantity: 1 },
          { order_item_id: "item-a", quantity: 1 },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/duplicate/i);
  });
});
