import { describe, it, expect } from "vitest";
import { settleResult } from "@/lib/results/settlement";

describe("settleResult", () => {
  it("ledgers one charge for a captured hold", () => {
    expect(
      settleResult({
        holdCaptureAmount: 420,
        holdIntentId: "pi_hold",
        topUpPaid: 0,
        topUpIntentId: null,
      }),
    ).toEqual({
      charges: [{ amount: 420, stripeObjectId: "pi_hold" }],
      paymentReference: "pi_hold",
      amountCaptured: 420,
    });
  });

  it("ledgers both intents when a top-up rode on top of a hold", () => {
    const s = settleResult({
      holdCaptureAmount: 400,
      holdIntentId: "pi_hold",
      topUpPaid: 35,
      topUpIntentId: "pi_topup",
    });
    expect(s.charges).toEqual([
      { amount: 400, stripeObjectId: "pi_hold" },
      { amount: 35, stripeObjectId: "pi_topup" },
    ]);
    expect(s.amountCaptured).toBe(435);
    // The hold is still what the Order names when it captured.
    expect(s.paymentReference).toBe("pi_hold");
  });

  it("ledgers only the Balance payment when there was no hold", () => {
    // The regression this file exists for: a zero-amount row for a hold that
    // never existed would raise the refund ceiling above what Stripe ever took.
    expect(
      settleResult({
        holdCaptureAmount: 0,
        holdIntentId: null,
        topUpPaid: 428,
        topUpIntentId: "pi_balance",
      }),
    ).toEqual({
      charges: [{ amount: 428, stripeObjectId: "pi_balance" }],
      paymentReference: "pi_balance",
      amountCaptured: 428,
    });
  });

  it("refuses to ledger a hold capture that has no payment intent", () => {
    expect(() =>
      settleResult({ holdCaptureAmount: 100, holdIntentId: null, topUpPaid: 10, topUpIntentId: "pi_balance" }),
    ).toThrow(/payment intent/);
  });

  it("never writes a zero-amount charge row", () => {
    const s = settleResult({
      holdCaptureAmount: 0,
      holdIntentId: null,
      topUpPaid: 0,
      topUpIntentId: null,
    });
    expect(s.charges).toEqual([]);
    expect(s.paymentReference).toBeNull();
    expect(s.amountCaptured).toBe(0);
  });
});
