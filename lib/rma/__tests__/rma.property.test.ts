import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  RMA_TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  nextStatuses,
  terminalForResolution,
  type RmaResolution,
  type RmaStatus,
} from "@/lib/rma/transitions";
import { rmaRefundAmount } from "@/lib/rma/refund";
import { lineRefundAmount, selectionRefundAmount } from "@/lib/ecommerce/admin-refund";
import { planRmaCreate, type PlanOrderItem } from "@/lib/rma/create";

const STATUSES: RmaStatus[] = [
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "instructions_sent",
  "received",
  "completed",
  "refunded",
];

const ADR_0011_TABLE: Record<RmaStatus, RmaStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["instructions_sent", "cancelled"],
  instructions_sent: ["received", "cancelled"],
  received: ["completed", "refunded"],
  completed: [],
  refunded: [],
  rejected: [],
  cancelled: [],
};

const ADR_0011_TERMINAL: RmaStatus[] = ["completed", "refunded", "rejected", "cancelled"];
const RESOLUTIONS: RmaResolution[] = ["refund", "exchange", "replacement"];

const DELIVERED = "2026-11-10T00:00:00Z";
const NOW = new Date("2026-11-20T00:00:00Z");

const orderItems: fc.Arbitrary<PlanOrderItem[]> = fc
  .array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 4 }),
      kind: fc.constantFrom<string | null>(null, "goods", "service"),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((rows) => rows.map((r, i) => ({ id: `i${i}`, quantity: r.quantity, kind: r.kind, product_title: `Line ${i}` })));

const requestFor = (items: PlanOrderItem[]) =>
  fc.array(
    fc.record({
      order_item_id: fc.oneof(
        { weight: 9, arbitrary: fc.constantFrom(...items.map((i) => i.id)) },
        { weight: 1, arbitrary: fc.constant("not-on-order") },
      ),
      quantity: fc.integer({ min: 0, max: 6 }),
    }),
    { minLength: 0, maxLength: items.length + 1 },
  );

type GenLine = { id: string; quantity: number; total_price: number; unit_price: number; kind: string };

const unitCentsOf = (lines: GenLine[], id: string) => Math.round(lines.find((l) => l.id === id)!.unit_price * 100);

const listCentsOf = (lines: GenLine[], returned: Array<{ order_item_id: string; quantity: number }>) =>
  returned.reduce((t, r) => t + unitCentsOf(lines, r.order_item_id) * r.quantity, 0);

const goodsCashCents = (order: { total: number; shipping_amount: number }) => Math.round(order.total * 100) - Math.round(order.shipping_amount * 100);

type Fallback = "product scope" | "category scope" | "coupon row gone" | "service line";

const returnOnOrder = ({ coupon, points, fallback = false }: { coupon: boolean; points: boolean; fallback?: boolean }) =>
  fc
    .record({
      lines: fc.array(
        fc.record({ unitCents: fc.integer({ min: 1, max: 50_000 }), quantity: fc.integer({ min: 1, max: 5 }) }),
        { minLength: 1, maxLength: 6 },
      ),
      offBasisPoints: fallback ? fc.integer({ min: 100, max: 9_000 }) : coupon ? fc.integer({ min: 0, max: 10_000 }) : fc.constant(0),
      pointsShare: points ? fc.double({ min: 0, max: 1, noNaN: true }) : fc.constant(0),
      shippingCents: fc.integer({ min: 0, max: 2_000 }),
      why: fc.constantFrom<Fallback>("product scope", "category scope", "coupon row gone", "service line"),
    })
    .chain(({ lines: raw, offBasisPoints, pointsShare, shippingCents, why }) => {
      const goodsLines: GenLine[] = raw.map((l, i) => ({
        id: `l${i}`,
        quantity: l.quantity,
        total_price: (l.unitCents * l.quantity) / 100,
        unit_price: l.unitCents / 100,
        kind: "goods",
      }));
      const lines = fallback && why === "service line"
        ? [...goodsLines, { id: "svc", quantity: 1, total_price: 50, unit_price: 50, kind: "service" }]
        : goodsLines;
      const subtotalCents = lines.reduce((t, l) => t + Math.round(l.total_price * 100), 0);
      const couponOffCents = Math.max(fallback ? 1 : 0, Math.floor((subtotalCents * offBasisPoints) / 10_000));
      const afterCouponCents = subtotalCents - couponOffCents;
      const pointsCents = Math.floor((afterCouponCents * pointsShare) / 100) * 100;
      const coupons = !fallback
        ? { applies_to: null }
        : why === "product scope"
          ? { applies_to: { product_ids: ["prod-x"] } }
          : why === "category scope"
            ? { applies_to: { category_ids: ["cat-x"] } }
            : why === "coupon row gone"
              ? null
              : { applies_to: null };
      const order = {
        subtotal: subtotalCents / 100,
        shipping_amount: shippingCents / 100,
        discount_amount: (couponOffCents + pointsCents) / 100,
        points_discount: pointsCents / 100,
        total: (afterCouponCents - pointsCents + shippingCents) / 100,
        coupons,
      };
      const returned = fc
        .subarray(goodsLines, { minLength: 0 })
        .chain((picked) =>
          picked.length === 0
            ? fc.constant([] as Array<{ order_item_id: string; quantity: number }>)
            : fc.tuple(...picked.map((l) => fc.integer({ min: 1, max: l.quantity }).map((quantity) => ({ order_item_id: l.id, quantity })))),
        );
      return returned.map((r) => ({ order, lines, returned: r }));
    });

describe("Returns / RMA lifecycle (ADR 0011)", () => {
  it("allows exactly the transitions the ADR's state machine lists, for every pair of states", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        expect({ from, to, allowed: canTransition(from, to) }).toEqual({
          from,
          to,
          allowed: ADR_0011_TABLE[from].includes(to),
        });
      }
    }
  });

  it("each of the four terminal states accepts none of the eight events", () => {
    for (const terminal of ADR_0011_TERMINAL) {
      expect(isTerminal(terminal)).toBe(true);
      expect(nextStatuses(terminal)).toEqual([]);
      for (const to of STATUSES) expect({ terminal, to, allowed: canTransition(terminal, to) }).toEqual({ terminal, to, allowed: false });
    }
  });

  it("a state is terminal exactly when the ADR names it terminal", () => {
    for (const s of STATUSES) {
      expect({ s, terminal: isTerminal(s) }).toEqual({ s, terminal: ADR_0011_TERMINAL.includes(s) });
      expect({ s, listed: RMA_TERMINAL_STATUSES.includes(s) }).toEqual({ s, listed: ADR_0011_TERMINAL.includes(s) });
    }
  });

  it("every resolution settles in the terminal state the ADR's outcome table names, reachable from received", () => {
    for (const r of RESOLUTIONS) {
      const end = terminalForResolution(r);
      expect(end).toBe(r === "refund" ? "refunded" : "completed");
      expect(canTransition("received", end)).toBe(true);
    }
  });

  it("a planned return never asks for more of a line than was ordered less what is in open returns", () => {
    fc.assert(
      fc.property(
        orderItems.chain((items) =>
          fc.tuple(
            fc.constant(items),
            fc.tuple(...items.map((i) => fc.integer({ min: 0, max: i.quantity + 1 }))),
            requestFor(items),
          ),
        ),
        ([items, open, requested]) => {
          const alreadyReturnedByItem = Object.fromEntries(items.map((i, n) => [i.id, open[n]]));
          const plan = planRmaCreate({
            order: { delivered_at: DELIVERED, status: "delivered" },
            orderItems: items,
            alreadyReturnedByItem,
            requestedItems: requested,
            resolution: "refund",
            returnWindowDays: 30,
            now: NOW,
          });
          const byId = new Map(items.map((i) => [i.id, i]));
          const allowedQty = (id: string) => {
            const item = byId.get(id);
            return item && item.kind !== "service" ? Math.max(0, item.quantity - alreadyReturnedByItem[id]) : 0;
          };
          const ids = requested.map((r) => r.order_item_id);
          const shouldPass =
            requested.length > 0 &&
            new Set(ids).size === ids.length &&
            requested.every((r) => r.quantity >= 1 && r.quantity <= allowedQty(r.order_item_id));
          expect(plan.ok).toBe(shouldPass);
          if (!plan.ok) return;
          expect(plan.rows.items).toEqual(requested.map((r) => ({ order_item_id: r.order_item_id, quantity: r.quantity })));
          for (const row of plan.rows.items) {
            expect(row.quantity).toBeGreaterThanOrEqual(1);
            expect(row.quantity).toBeLessThanOrEqual(allowedQty(row.order_item_id));
          }
        },
      ),
    );
  });

  it("across any sequence of return requests, the quantity of a line in open returns never exceeds what was ordered", () => {
    fc.assert(
      fc.property(
        orderItems.chain((items) =>
          fc.tuple(
            fc.constant(items),
            fc.array(
              fc.record({
                requested: fc.array(
                  fc.record({
                    order_item_id: fc.constantFrom(...items.map((i) => i.id)),
                    quantity: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 1, max: 2 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 6 }) }),
                  }),
                  { minLength: 1, maxLength: 2 },
                ),
                settlesAt: fc.nat({ max: 10 }),
              }),
              { minLength: 2, maxLength: 12 },
            ),
          ),
        ),
        ([items, requests]) => {
          const open: Array<{ rows: Array<{ order_item_id: string; quantity: number }>; settlesAfter: number }> = [];
          requests.forEach((req, step) => {
            for (let k = open.length - 1; k >= 0; k--) if (open[k].settlesAfter <= step) open.splice(k, 1);
            const alreadyReturnedByItem: Record<string, number> = {};
            for (const o of open) for (const r of o.rows) alreadyReturnedByItem[r.order_item_id] = (alreadyReturnedByItem[r.order_item_id] ?? 0) + r.quantity;
            const plan = planRmaCreate({
              order: { delivered_at: DELIVERED, status: "delivered" },
              orderItems: items,
              alreadyReturnedByItem,
              requestedItems: req.requested,
              resolution: "refund",
              returnWindowDays: 30,
              now: NOW,
            });
            if (plan.ok) open.push({ rows: plan.rows.items, settlesAfter: step + 1 + req.settlesAt });
            for (const item of items) {
              const inOpen = open.reduce((t, o) => t + o.rows.filter((r) => r.order_item_id === item.id).reduce((s, r) => s + r.quantity, 0), 0);
              expect(inOpen).toBeLessThanOrEqual(item.kind === "service" ? 0 : item.quantity);
            }
          });
        },
      ),
    );
  });

  it("with no coupon, no tax and no points, a return refunds the list price of the units returned, to the cent", () => {
    fc.assert(
      fc.property(returnOnOrder({ coupon: false, points: false }), ({ order, lines, returned }) => {
        expect(Math.round(rmaRefundAmount(order, lines, returned) * 100)).toBe(listCentsOf(lines, returned));
      }),
    );
  });

  it("with an Order-wide coupon or points, a return never refunds more than the list price of the units returned", () => {
    fc.assert(
      fc.property(returnOnOrder({ coupon: true, points: true }), ({ order, lines, returned }) => {
        expect(Math.round(rmaRefundAmount(order, lines, returned) * 100)).toBeLessThanOrEqual(listCentsOf(lines, returned));
      }),
    );
  });

  it("with points and no coupon or tax, a return refunds the list price of the units returned: the points stay spent on what was kept, and only the refundable balance caps it", () => {
    fc.assert(
      fc.property(returnOnOrder({ coupon: false, points: true }), ({ order, lines, returned }) => {
        expect(Math.round(rmaRefundAmount(order, lines, returned) * 100)).toBe(listCentsOf(lines, returned));
      }),
    );
  });

  it("a coupon that is scoped, gone, or on an Order with a service line falls back to the list price of the units returned, as before", () => {
    fc.assert(
      fc.property(
        fc.boolean().chain((points) => returnOnOrder({ coupon: true, points, fallback: true })),
        ({ order, lines, returned }) => {
          expect(Math.round(rmaRefundAmount(order, lines, returned) * 100)).toBe(listCentsOf(lines, returned));
        },
      ),
    );
  });

  it("on an Order with no points, returning every line at full quantity refunds exactly total less shipping", () => {
    fc.assert(
      fc.property(returnOnOrder({ coupon: true, points: false }), ({ order, lines }) => {
        const everything = lines.map((l) => ({ order_item_id: l.id, quantity: l.quantity }));
        expect(Math.round(rmaRefundAmount(order, lines, everything) * 100)).toBe(goodsCashCents(order));
      }),
    );
  });

  it("on an Order with an Order-wide coupon and no points, a return refunds what Choose items gives for the same lines, without the shipping", () => {
    fc.assert(
      fc.property(returnOnOrder({ coupon: true, points: false }), ({ order, lines, returned }) => {
        expect(rmaRefundAmount(order, lines, returned)).toBe(
          selectionRefundAmount(order, lines, { items: returned, shipping: false }),
        );
        const perLineCents = returned.reduce((t, r) => {
          const line = lines.find((l) => l.id === r.order_item_id)!;
          return t + Math.round(lineRefundAmount(order, lines, line, r.quantity) * 100);
        }, 0);
        expect(Math.round(rmaRefundAmount(order, lines, returned) * 100)).toBe(perLineCents);
      }),
    );
  });
});
