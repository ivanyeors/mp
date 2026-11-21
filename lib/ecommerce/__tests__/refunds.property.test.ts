import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  lineRefundAmount,
  refundableAmount,
  selectionRefundAmount,
  splitRefundAcrossIntents,
} from "@/lib/ecommerce/admin-refund";
import { summarize, type LedgerEntry } from "@/lib/ecommerce/money-ledger";
import { staffRefundDeniedReason, type OrderRefundFields } from "@/lib/results/post-delivery-refund";

const toCents = (n: number) => Math.round(n * 100);

const paidOrder = fc
  .array(fc.record({ unitCents: fc.oneof(fc.constantFrom(100, 4_500), fc.integer({ min: 100, max: 50_000 })), quantity: fc.integer({ min: 1, max: 4 }) }), {
    minLength: 1,
    maxLength: 6,
  })
  .chain((raw) => fc.constantFrom(raw, raw.map(() => raw[0])))
  .chain((raw) => {
    const subtotalCents = raw.reduce((t, l) => t + l.unitCents * l.quantity, 0);
    return fc.record({
      lines: fc.constant(raw.map((l, i) => ({ id: `l${i}`, quantity: l.quantity, total_price: (l.unitCents * l.quantity) / 100 }))),
      subtotalCents: fc.constant(subtotalCents),
      discountCents: fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: subtotalCents - 1 })),
      shippingCents: fc.integer({ min: 0, max: 2_000 }),
    });
  })
  .map((o) => ({
    lines: o.lines,
    totals: {
      subtotal: o.subtotalCents / 100,
      shipping_amount: o.shippingCents / 100,
      total: (o.subtotalCents - o.discountCents + o.shippingCents) / 100,
    },
  }));

const ledger = fc
  .record({
    charges: fc.array(fc.integer({ min: 1, max: 300_000 }), { minLength: 1, maxLength: 2 }),
    refunds: fc.array(fc.integer({ min: 1, max: 300_000 }), { maxLength: 6 }),
    fullAtEnd: fc.boolean(),
    fees: fc.array(fc.integer({ min: -2_000, max: 0 }), { maxLength: 2 }),
  })
  .map((r) => {
    const capturedCents = r.charges.reduce((t, c) => t + c, 0);
    let left = capturedCents;
    const refundCents: number[] = [];
    for (const want of r.refunds) {
      const cents = Math.min(want, left);
      if (cents <= 0) break;
      refundCents.push(cents);
      left -= cents;
    }
    if (r.fullAtEnd && left > 0) {
      refundCents.push(left);
      left = 0;
    }
    const entries: LedgerEntry[] = [
      ...r.charges.map((c, i) => ({ type: "charge" as const, amount: c / 100, stripeObjectId: `pi_${i}` })),
      ...refundCents.map((c, i) => ({ type: "refund" as const, amount: -c / 100, stripeObjectId: `re_${i}` })),
      ...r.fees.map((c, i) => ({ type: "fee" as const, amount: c / 100, stripeObjectId: `fee_${i}` })),
    ];
    return { entries, capturedCents, refundedCents: capturedCents - left };
  });

const ORDER_STATUSES = ["pending", "paid", "confirmed", "processing", "shipped", "delivered", "refunded", "cancelled"];
const resultSnapshot = { result_id: "r1", product_type: "pillow", build_lines: [] };

describe("Staff refunds (ADR 0038)", () => {
  it("the Order reads fully refunded exactly when nothing is left to refund", () => {
    fc.assert(
      fc.property(ledger, ({ entries, capturedCents, refundedCents }) => {
        const money = summarize(entries);
        expect(toCents(money.amountCaptured)).toBe(capturedCents);
        expect(toCents(money.amountRefunded)).toBe(refundedCents);
        const left = refundableAmount({ total: 0, amount_captured: money.amountCaptured, amount_refunded: money.amountRefunded });
        expect(toCents(left)).toBe(capturedCents - refundedCents);
        expect(money.status === "refunded").toBe(left === 0);
        expect(money.status === "paid").toBe(refundedCents === 0);
      }),
    );
  });

  it("once anything is captured, the refundable balance is what was captured less refunds, whatever the Order total says", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500_000 }),
        fc.integer({ min: 0, max: 600_000 }),
        fc.integer({ min: 0, max: 900_000 }),
        fc.integer({ min: 0, max: 900_000 }),
        (capturedCents, refundedCents, totalA, totalB) => {
          const at = (total: number) =>
            refundableAmount({ total: total / 100, amount_captured: capturedCents / 100, amount_refunded: refundedCents / 100 });
          expect(at(totalA)).toBe(at(totalB));
          expect(toCents(at(totalA))).toBe(Math.max(0, capturedCents - refundedCents));
        },
      ),
    );
  });

  it("choosing more of a line never refunds less, and never more than all of it", () => {
    fc.assert(
      fc.property(
        paidOrder.chain((o) => fc.tuple(fc.constant(o), fc.nat({ max: o.lines.length - 1 }), fc.integer({ min: -2, max: 8 }), fc.integer({ min: -2, max: 8 }))),
        ([order, index, a, b]) => {
          const line = order.lines[index];
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const less = lineRefundAmount(order.totals, order.lines, line, lo);
          const more = lineRefundAmount(order.totals, order.lines, line, hi);
          const all = lineRefundAmount(order.totals, order.lines, line, line.quantity);
          expect(less).toBeGreaterThanOrEqual(0);
          expect(less).toBeLessThanOrEqual(more);
          expect(more).toBeLessThanOrEqual(all);
        },
      ),
    );
  });

  it("choosing every line at full quantity and the shipping refunds exactly what the Order took, to the cent", () => {
    fc.assert(
      fc.property(paidOrder, (order) => {
        const everything = selectionRefundAmount(order.totals, order.lines, {
          items: order.lines.map((l) => ({ order_item_id: l.id, quantity: l.quantity })),
          shipping: true,
        });
        expect(toCents(everything)).toBe(toCents(order.totals.total));
      }),
    );
  });

  it("each line's full share is within a cent of its exact share, and the shares add up to what the Order took for goods", () => {
    fc.assert(
      fc.property(paidOrder, (order) => {
        const subtotalCents = toCents(order.totals.subtotal);
        const goodsCents = toCents(order.totals.total) - toCents(order.totals.shipping_amount);
        let sum = 0;
        for (const line of order.lines) {
          const shareCents = toCents(lineRefundAmount(order.totals, order.lines, line, line.quantity));
          const exactTimesSubtotal = toCents(line.total_price) * goodsCents;
          expect(shareCents).toBeGreaterThanOrEqual(0);
          expect(Math.abs(shareCents * subtotalCents - exactTimesSubtotal)).toBeLessThan(subtotalCents);
          sum += shareCents;
        }
        expect(sum).toBe(goodsCents);
      }),
    );
  });

  it("a line's share is the same whatever order the Order's lines arrive in", () => {
    fc.assert(
      fc.property(
        paidOrder.chain((o) => fc.tuple(fc.constant(o), fc.shuffledSubarray(o.lines, { minLength: o.lines.length }))),
        ([order, shuffled]) => {
          for (const line of order.lines) {
            for (let qty = 0; qty <= line.quantity; qty++) {
              expect(lineRefundAmount(order.totals, shuffled, line, qty)).toBe(lineRefundAmount(order.totals, order.lines, line, qty));
            }
          }
        },
      ),
    );
  });

  it("however an Order's lines, units and shipping are split across refunds, once everything has been chosen nothing is left to refund", () => {
    const splitOrder = paidOrder.chain((order) => {
      const units = [
        ...order.lines.flatMap((l) => Array.from({ length: l.quantity }, () => l.id)),
        "shipping",
      ];
      return fc.record({
        order: fc.constant(order),
        sequence: fc.shuffledSubarray(units, { minLength: units.length }),
        cutAfter: fc.array(fc.boolean(), { minLength: units.length, maxLength: units.length }),
        arrivals: fc.array(fc.shuffledSubarray(order.lines, { minLength: order.lines.length }), {
          minLength: units.length,
          maxLength: units.length,
        }),
      });
    });
    fc.assert(
      fc.property(splitOrder, ({ order, sequence, cutAfter, arrivals }) => {
        const events: string[][] = [[]];
        sequence.forEach((unit, i) => {
          events[events.length - 1].push(unit);
          if (cutAfter[i] && i < sequence.length - 1) events.push([]);
        });
        let remaining = toCents(order.totals.total);
        events.forEach((event, i) => {
          const quantities = new Map<string, number>();
          for (const unit of event) if (unit !== "shipping") quantities.set(unit, (quantities.get(unit) ?? 0) + 1);
          const amount = selectionRefundAmount(order.totals, arrivals[i], {
            items: [...quantities].map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
            shipping: event.includes("shipping"),
          });
          remaining -= Math.min(toCents(amount), remaining);
        });
        expect(remaining).toBe(0);
      }),
    );
  });

  it("a refund split across intents moves exactly the amount asked, within each charge's balance, largest first, or is refused", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400_000 }),
        fc.uniqueArray(
          fc.record({ paymentIntentId: fc.constantFrom("pi_hold", "pi_topup", "pi_x"), refundableCents: fc.integer({ min: 0, max: 200_000 }) }),
          { selector: (b) => b.paymentIntentId, minLength: 1, maxLength: 3 },
        ),
        (amountCents, balances) => {
          const parts = splitRefundAcrossIntents(amountCents, balances);
          const available = balances.reduce((t, b) => t + b.refundableCents, 0);
          if (available < amountCents) {
            expect(parts).toBeNull();
            return;
          }
          expect(parts).not.toBeNull();
          expect(parts!.reduce((t, p) => t + p.cents, 0)).toBe(amountCents);
          expect(new Set(parts!.map((p) => p.paymentIntentId)).size).toBe(parts!.length);
          for (const p of parts!) {
            const b = balances.find((x) => x.paymentIntentId === p.paymentIntentId)!;
            expect(p.cents).toBeGreaterThan(0);
            expect(p.cents).toBeLessThanOrEqual(b.refundableCents);
          }
          const largest = Math.max(...balances.map((b) => b.refundableCents));
          if (amountCents <= largest) expect(parts).toHaveLength(1);
        },
      ),
    );
  });

  it("a charge correction is never refused, and a Result Order is refunded as a return only after it shipped and is back in person", () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom(...ORDER_STATUSES),
          shipped_at: fc.option(fc.constant("2026-11-01T00:00:00Z"), { nil: null }),
          delivered_at: fc.option(fc.constant("2026-11-03T00:00:00Z"), { nil: null }),
        }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (order: OrderRefundFields, isResult, returned, inPerson) => {
          const items = isResult
            ? [{ customization_snapshot: resultSnapshot }, { customization_snapshot: null }]
            : [{ customization_snapshot: null }, { customization_snapshot: { config_lines: [] } }];
          const denied = staffRefundDeniedReason(order, items, { returned, inPersonReturnAcknowledged: inPerson });
          const shipped =
            order.status === "shipped" || order.status === "delivered" || order.shipped_at != null || order.delivered_at != null;
          const allowed = !returned || !isResult || (shipped && inPerson);
          expect(denied === null).toBe(allowed);
        },
      ),
    );
  });
});
