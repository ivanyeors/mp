import { describe, it, expect } from "vitest";
import { transitionResult } from "@/lib/result-lifecycle";
import { planCapture } from "@/lib/authorization-hold";
import { assembleBuild, findStockShortages } from "@/lib/build-assembly";

/** Slice 07: accept/capture/top-up/release rules (no live Stripe). */

describe("slice 07 accept path", () => {
  // Was: "rejects accept without payment intent (review-only)". ADR 0016 moved
  // that guard to `capture`, because for a Result with no hold Accept is the step
  // that creates the Balance payment Checkout and must run before money exists.
  it("accepts without a payment intent — a no-hold Result settles by Balance payment", () => {
    const result = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: null },
      { action: "accept" },
    );
    expect(result).toEqual({ ok: true, status: "accepted", releaseHold: false });
  });

  it("refuses to capture a no-hold Result until the Balance payment is paid", () => {
    const unpaid = transitionResult(
      { status: "accepted", filling_template_id: 1, payment_intent_id: null },
      { action: "capture" },
    );
    expect(unpaid.ok).toBe(false);
    if (!unpaid.ok) expect(unpaid.error).toMatch(/balance payment/i);

    const paid = transitionResult(
      {
        status: "accepted",
        filling_template_id: 1,
        payment_intent_id: null,
        balance_paid: true,
      },
      { action: "capture" },
    );
    expect(paid).toEqual({ ok: true, status: "captured", releaseHold: false });
  });

  it("plans the whole total as a Balance payment when there is no hold", () => {
    expect(planCapture(420, 0)).toEqual({ kind: "top_up", holdCapture: 0, topUp: 420 });
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
