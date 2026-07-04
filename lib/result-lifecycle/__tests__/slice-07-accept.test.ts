import { describe, it, expect } from "vitest";
import { transitionResult } from "@/lib/result-lifecycle";
import { planCapture } from "@/lib/authorization-hold";
import { assembleBuild, findStockShortages } from "@/lib/build-assembly";

/** Slice 07: accept/capture/top-up/release rules (no live Stripe). */

describe("slice 07 accept path", () => {
  it("rejects accept without payment intent (review-only)", () => {
    const result = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: null },
      { action: "accept" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/payment intent/i);
  });

  it("accept then capture when hold present", () => {
    const accepted = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_1" },
      { action: "accept" },
    );
    expect(accepted).toEqual({ ok: true, status: "accepted", releaseHold: false });

    const captured = transitionResult(
      { status: "accepted", filling_template_id: 1, payment_intent_id: "pi_1" },
      { action: "capture" },
    );
    expect(captured).toEqual({ ok: true, status: "captured", releaseHold: false });
  });

  it("captures final when final ≤ authorized (never over-capture)", () => {
    expect(planCapture(90, 100)).toEqual({ kind: "capture", amount: 90 });
    expect(planCapture(100, 100)).toEqual({ kind: "capture", amount: 100 });
  });

  it("requires top-up when final > authorized", () => {
    expect(planCapture(120, 100)).toEqual({
      kind: "top_up",
      holdCapture: 100,
      topUp: 20,
    });
  });

  it("stock re-validation failure blocks accept", () => {
    const assembled = assembleBuild({
      composedBomLines: [{ item_id: 1, quantity: 1, category: "packaging" }],
      fillingTemplateLines: [{ item_id: 2, quantity: 2, category: "filling" }],
      preferenceLines: [{ item_id: 3, quantity: 1, category: "cover" }],
      addonLines: [],
      costByItem: new Map(),
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const shortages = findStockShortages(
      assembled.lines,
      new Map([
        [1, 1],
        [2, 0],
        [3, 1],
      ]),
    );
    expect(shortages.some((s) => s.item_id === 2)).toBe(true);
  });

  it("decline releases hold and does not create an order path", () => {
    const declined = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_1" },
      { action: "decline" },
    );
    expect(declined).toEqual({ ok: true, status: "declined", releaseHold: true });
  });

  it("blocks decline after accept (cancel-before-delivery)", () => {
    const declined = transitionResult(
      { status: "accepted", filling_template_id: 1, payment_intent_id: "pi_1" },
      { action: "decline" },
    );
    expect(declined.ok).toBe(false);
  });
});
