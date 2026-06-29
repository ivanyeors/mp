import { describe, it, expect } from "vitest";
import { reconcileOrderTotal, sessionTotals } from "../reconcile";

// A discounted ($10 off), taxed (SG GST 9%) order: subtotal 100, shipping 5.
// Pre-tax = 100 − 10 + 5 = 95; Stripe Tax adds 9% = 8.55; total 103.55.
const order = { subtotal: 100, discount_amount: 10, shipping_amount: 5, tax_amount: 8.1 };

describe("reconcileOrderTotal", () => {
  it("persisted total equals the Stripe session total for a discounted, taxed order", () => {
    const totals = sessionTotals({ amount_total: 10355, total_details: { amount_tax: 855 } });
    const recon = reconcileOrderTotal(order, totals);

    expect(recon.ok).toBe(true);
    // The write-back total is exactly what Stripe charged.
    expect(recon.writeBack.total).toBe(103.55);
    expect(recon.writeBack.total).toBe(totals.amountTotal);
    // Stripe's tax is authoritative (overrides the 8.1 estimate).
    expect(recon.writeBack.tax_amount).toBe(8.55);
  });

  it("flags a discount leak (Stripe charged the full pre-discount amount)", () => {
    // Stripe ignored the $10 discount: pre-tax 105, tax 9.45, total 114.45.
    const totals = sessionTotals({ amount_total: 11445, total_details: { amount_tax: 945 } });
    const recon = reconcileOrderTotal(order, totals);

    expect(recon.ok).toBe(false);
    expect(recon.delta).toBe(10); // the leaked discount
  });

  it("uses the estimate as tax when Stripe Tax is off (manual tax mode)", () => {
    // Manual tax: tax is a line item, session amount_tax is 0, total 103.55.
    const totals = sessionTotals({ amount_total: 10355, total_details: { amount_tax: 0 } });
    const manualOrder = { ...order, tax_amount: 8.55 };
    const recon = reconcileOrderTotal(manualOrder, totals);

    expect(recon.ok).toBe(true);
    expect(recon.writeBack.tax_amount).toBe(8.55);
    expect(recon.writeBack.total).toBe(103.55);
  });
});
