import { describe, it, expect } from "vitest";
import {
  addEntry,
  summarize,
  ledgerReconciles,
  type LedgerEntry,
} from "../money-ledger";

const charge = (amount: number, id = "pi_1"): LedgerEntry => ({
  type: "charge",
  amount,
  stripeObjectId: id,
});
const refund = (amount: number, id: string): LedgerEntry => ({
  type: "refund",
  amount: -Math.abs(amount),
  stripeObjectId: id,
});

describe("summarize", () => {
  it("a partial refund yields partially_refunded with the refunded amount", () => {
    const entries = [charge(100), refund(30, "re_1")];
    const state = summarize(entries);
    expect(state.status).toBe("partially_refunded");
    expect(state.amountRefunded).toBe(30);
    expect(state.amountCaptured).toBe(100);
    expect(state.netPaid).toBe(70);
  });

  it("refunds summing to the full charge yield refunded", () => {
    const state = summarize([charge(100), refund(30, "re_1"), refund(70, "re_2")]);
    expect(state.status).toBe("refunded");
    expect(state.amountRefunded).toBe(100);
    expect(state.netPaid).toBe(0);
  });

  it("a clean charge with no refunds is paid", () => {
    expect(summarize([charge(89.5)]).status).toBe("paid");
  });

  it("dispute loss and fee reduce net paid without counting as refunds", () => {
    const state = summarize([
      charge(100),
      { type: "dispute_loss", amount: -100, stripeObjectId: "dp_1" },
      { type: "fee", amount: -20, stripeObjectId: "dp_1:fee" },
    ]);
    expect(state.amountRefunded).toBe(0);
    expect(state.status).toBe("paid");
    expect(state.netPaid).toBe(-20);
  });
});

describe("addEntry — idempotency", () => {
  it("a duplicate stripe_object_id is a no-op (no double count)", () => {
    let entries: LedgerEntry[] = [charge(100)];
    entries = addEntry(entries, refund(30, "re_1"));
    entries = addEntry(entries, refund(30, "re_1")); // re-delivered event
    expect(entries).toHaveLength(2);
    expect(summarize(entries).amountRefunded).toBe(30);
  });

  it("distinct refund ids accumulate", () => {
    let entries: LedgerEntry[] = [charge(100)];
    entries = addEntry(entries, refund(30, "re_1"));
    entries = addEntry(entries, refund(20, "re_2"));
    expect(summarize(entries).amountRefunded).toBe(50);
  });
});

describe("ledgerReconciles", () => {
  it("net charge/refund reconciles to total - amountRefunded", () => {
    const entries = [charge(120), refund(45, "re_1")];
    expect(ledgerReconciles(120, entries)).toBe(true);
  });

  it("flags a captured amount that does not match the order total", () => {
    const entries = [charge(110), refund(45, "re_1")]; // charged 110 for a 120 order
    expect(ledgerReconciles(120, entries)).toBe(false);
  });

  it("tolerates sub-cent float drift", () => {
    const entries = [charge(100.1), refund(0.1, "re_1")];
    expect(ledgerReconciles(100.1, entries)).toBe(true);
  });
});
