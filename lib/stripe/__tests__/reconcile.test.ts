import { describe, it, expect } from "vitest";
import { reconcileOrderTotal, sessionTotals } from "../reconcile";

const order = { subtotal: 100, discount_amount: 10, shipping_amount: 5, tax_amount: 8.1 };

describe("reconcileOrderTotal", () => {
  it("persisted total equals the Stripe session total for a discounted, taxed order", () => {
    const totals = sessionTotals({ amount_total: 10355, total_details: { amount_tax: 855 } });
    const recon = reconcileOrderTotal(order, totals);

    expect(recon.ok).toBe(true);
    expect(recon.writeBack.total).toBe(103.55);
    expect(recon.writeBack.total).toBe(totals.amountTotal);
    expect(recon.writeBack.tax_amount).toBe(8.55);
  });

  it("flags a discount leak (Stripe charged the full pre-discount amount)", () => {
    const totals = sessionTotals({ amount_total: 11445, total_details: { amount_tax: 945 } });
    const recon = reconcileOrderTotal(order, totals);

    expect(recon.ok).toBe(false);
    expect(recon.delta).toBe(10);
  });

  it("uses the estimate as tax when Stripe Tax is off (manual tax mode)", () => {
    const totals = sessionTotals({ amount_total: 10355, total_details: { amount_tax: 0 } });
    const manualOrder = { ...order, tax_amount: 8.55 };
    const recon = reconcileOrderTotal(manualOrder, totals);

    expect(recon.ok).toBe(true);
    expect(recon.writeBack.tax_amount).toBe(8.55);
    expect(recon.writeBack.total).toBe(103.55);
  });
});
