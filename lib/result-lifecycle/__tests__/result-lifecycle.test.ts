import { describe, it, expect } from "vitest";
import { transitionResult, type ResultState } from "@/lib/result-lifecycle";

const heldWithHold: ResultState = {
  status: "held",
  filling_template_id: null,
  payment_intent_id: "pi_abc",
};

const heldReviewOnly: ResultState = {
  status: "held",
  filling_template_id: null,
  payment_intent_id: null,
};

describe("transitionResult", () => {
  it("rejects illegal transitions", () => {
    expect(transitionResult(heldWithHold, { action: "accept" }).ok).toBe(false);
    expect(transitionResult(heldWithHold, { action: "capture" }).ok).toBe(false);
    expect(
      transitionResult(
        { status: "captured", filling_template_id: 1, payment_intent_id: "pi_abc" },
        { action: "assign", filling_template_id: 1 },
      ).ok,
    ).toBe(false);
  });

  it("assign requires a Filling Template", () => {
    const missing = transitionResult(heldWithHold, {
      action: "assign",
      filling_template_id: 0,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/Filling Template/i);

    const ok = transitionResult(heldWithHold, {
      action: "assign",
      filling_template_id: 42,
    });
    expect(ok).toEqual({ ok: true, status: "assigned", releaseHold: false });
  });

  it("allows assignment on a Result with no payment intent (in-store review-only)", () => {
    const ok = transitionResult(heldReviewOnly, {
      action: "assign",
      filling_template_id: 7,
    });
    expect(ok).toEqual({ ok: true, status: "assigned", releaseHold: false });
  });

  it("capture requires Accept and a payment intent", () => {
    const assigned = transitionResult(heldWithHold, {
      action: "assign",
      filling_template_id: 1,
    });
    expect(assigned.ok).toBe(true);

    const beforeAccept = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_abc" },
      { action: "capture" },
    );
    expect(beforeAccept.ok).toBe(false);

    const acceptNoPi = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: null },
      { action: "accept" },
    );
    expect(acceptNoPi.ok).toBe(false);
    if (!acceptNoPi.ok) expect(acceptNoPi.error).toMatch(/payment intent/i);

    const accepted = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_abc" },
      { action: "accept" },
    );
    expect(accepted).toEqual({ ok: true, status: "accepted", releaseHold: false });

    const noPi = transitionResult(
      { status: "accepted", filling_template_id: 1, payment_intent_id: null },
      { action: "capture" },
    );
    expect(noPi.ok).toBe(false);
    if (!noPi.ok) expect(noPi.error).toMatch(/payment intent/i);

    const captured = transitionResult(
      { status: "accepted", filling_template_id: 1, payment_intent_id: "pi_abc" },
      { action: "capture" },
    );
    expect(captured).toEqual({ ok: true, status: "captured", releaseHold: false });
  });

  it("decline and expire release hold when present", () => {
    const declined = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_abc" },
      { action: "decline" },
    );
    expect(declined).toEqual({ ok: true, status: "declined", releaseHold: true });

    const declinedNoHold = transitionResult(
      { status: "assigned", filling_template_id: 1, payment_intent_id: null },
      { action: "decline" },
    );
    expect(declinedNoHold).toEqual({
      ok: true,
      status: "declined",
      releaseHold: false,
    });

    const expired = transitionResult(heldWithHold, { action: "expire" });
    expect(expired).toEqual({ ok: true, status: "expired", releaseHold: true });

    const expiredNoHold = transitionResult(heldReviewOnly, { action: "expire" });
    expect(expiredNoHold).toEqual({
      ok: true,
      status: "expired",
      releaseHold: false,
    });
  });

  describe("cancel", () => {
    it("voids a held Result and releases its hold", () => {
      expect(transitionResult(heldWithHold, { action: "cancel" })).toEqual({
        ok: true,
        status: "cancelled",
        releaseHold: true,
      });
    });

    it("voids an assigned Result — the state the SLA cron never watches", () => {
      expect(
        transitionResult(
          { status: "assigned", filling_template_id: 1, payment_intent_id: "pi_abc" },
          { action: "cancel" },
        ),
      ).toEqual({ ok: true, status: "cancelled", releaseHold: true });
    });

    it("releases nothing on a review-only Result", () => {
      expect(transitionResult(heldReviewOnly, { action: "cancel" })).toEqual({
        ok: true,
        status: "cancelled",
        releaseHold: false,
      });
    });

    it("leaves terminal states terminal", () => {
      for (const status of ["captured", "declined", "expired", "cancelled"] as const) {
        const res = transitionResult(
          { status, filling_template_id: 1, payment_intent_id: "pi_abc" },
          { action: "cancel" },
        );
        expect(res.ok).toBe(false);
      }
    });
  });
});
