import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { pointsForOrder } from "@/lib/points/earn";
import { pointsAllowance, validatePointsRequest } from "@/lib/points/spend";
import { POINTS_PER_DOLLAR } from "@/lib/points/value";

const SHARES = [0.5, 0.25, 0.3, 0.29, 0.33, 0.75, 1];

const spendInput = fc
  .record({
    maxShare: fc.constantFrom(...SHARES),
    minRedeem: fc.integer({ min: 1, max: 10 }).map((n) => n * 100),
    dollars: fc.integer({ min: 1, max: 600 }),
    randomCents: fc.integer({ min: 0, max: 60_000 }),
    shape: fc.constantFrom("whole", "below-share-step", "random"),
    available: fc.oneof(fc.integer({ min: 0, max: 5_000 }), fc.constant(1_000_000)),
  })
  .map((r) => {
    const productsCents =
      r.shape === "whole"
        ? r.dollars * 100
        : r.shape === "below-share-step"
          ? Math.ceil((r.dollars * 100) / r.maxShare) - 1
          : r.randomCents;
    return {
      available: r.available,
      productsAfterCoupon: productsCents / 100,
      minRedeem: r.minRedeem,
      maxShare: r.maxShare,
      productsCents,
    };
  });

const earnedOrder = fc
  .record({
    subtotalCents: fc.integer({ min: 0, max: 500_000 }),
    discountShare: fc.double({ min: 0, max: 1, noNaN: true }),
    refundedShare: fc.double({ min: 0, max: 1, noNaN: true }),
    moreShare: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map((r) => {
    const discountCents = Math.floor(r.subtotalCents * r.discountShare);
    const paidCents = r.subtotalCents - discountCents;
    const refundedCents = Math.floor(paidCents * r.refundedShare);
    const moreCents = Math.floor((paidCents - refundedCents) * r.moreShare);
    return {
      order: { subtotal: r.subtotalCents / 100, discount: discountCents / 100, refunded: refundedCents / 100 },
      keptCents: paidCents - refundedCents,
      moreCents,
    };
  });

describe("Loyalty points (ADR 0030)", () => {
  it("the most points an order allows is in 100-point steps from the minimum, within the balance and the share, and never the whole price", () => {
    fc.assert(
      fc.property(spendInput, (input) => {
        const allowance = pointsAllowance(input);
        if (allowance == null) return;
        expect(allowance % POINTS_PER_DOLLAR).toBe(0);
        expect(allowance).toBeGreaterThanOrEqual(input.minRedeem);
        expect(allowance).toBeLessThanOrEqual(input.available);
        expect(allowance).toBeLessThan(input.productsCents);
        expect(allowance).toBeLessThanOrEqual(Math.floor(input.maxShare * input.productsCents + 1e-6));
      }),
    );
  });

  it("the server accepts the allowance and refuses one step more", () => {
    fc.assert(
      fc.property(spendInput, (input) => {
        const allowance = pointsAllowance(input);
        if (allowance == null) return;
        expect(validatePointsRequest(allowance, input)).toEqual({ ok: true, points: allowance, discount: allowance / 100 });
        expect(validatePointsRequest(allowance + POINTS_PER_DOLLAR, input).ok).toBe(false);
      }),
    );
  });

  it("the server never accepts a spend off the 100-point step, below the minimum or above the balance", () => {
    fc.assert(
      fc.property(
        spendInput.chain((input) => {
          const near = [pointsAllowance(input), input.minRedeem, Math.floor(input.available / 100) * 100].filter(
            (n): n is number => n != null,
          );
          return fc.tuple(
            fc.constant(input),
            fc.oneof(
              { weight: 1, arbitrary: fc.integer({ min: -500, max: 200_000 }) },
              {
                weight: 4,
                arbitrary: fc.tuple(fc.constantFrom(...near), fc.constantFrom(-100, -50, -1, 0, 1, 50, 100)).map(([n, d]) => n + d),
              },
            ),
          );
        }),
        ([input, requested]) => {
          const check = validatePointsRequest(requested, input);
          if (!check.ok) return;
          expect(check.points % POINTS_PER_DOLLAR).toBe(0);
          expect(check.points).toBeGreaterThanOrEqual(input.minRedeem);
          expect(check.points).toBeLessThanOrEqual(input.available);
          expect(check.points).toBeLessThan(input.productsCents);
        },
      ),
    );
  });

  it("an Order earns floor(rate x cash kept), and a later refund never raises it", () => {
    fc.assert(
      fc.property(earnedOrder, fc.constantFrom(1, 3, 0.5, 1.5, 20), ({ order, keptCents, moreCents }, rate) => {
        const earned = pointsForOrder(order, rate);
        expect(earned).toBe(Math.floor((Math.round(rate * 10_000) * keptCents) / 1_000_000));
        const later = pointsForOrder({ ...order, refunded: Math.round((order.refunded * 100 + moreCents)) / 100 }, rate);
        expect(later).toBeLessThanOrEqual(earned);
        expect(later).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});
