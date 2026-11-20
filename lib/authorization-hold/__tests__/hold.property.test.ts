import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { planCapture } from "@/lib/authorization-hold/settlement-plan";
import { transitionResult, type ResultState, type Transition } from "@/lib/result-lifecycle";
import { settleResult } from "@/lib/results/settlement";
import {
  companionAtAccept,
  endingPlan,
  liveCompanions,
  pairAuthorized,
  pickPartner,
} from "@/lib/results/paired-build";

const RESULT_STATUSES = ["held", "assigned", "accepted", "captured", "declined", "expired", "cancelled"];
const ENDED = ["declined", "expired", "cancelled"];

const toCents = (n: number) => Math.round(n * 100);
const money = (min: number, max: number) => fc.integer({ min, max }).map((c) => c / 100);

const transition: fc.Arbitrary<Transition> = fc.constantFrom<Transition>(
  { action: "assign", filling_template_id: 7 },
  { action: "accept" },
  { action: "decline" },
  { action: "expire" },
  { action: "capture" },
  { action: "cancel" },
);

const heldResult: fc.Arbitrary<ResultState> = fc.record({
  status: fc.constant("held" as const),
  filling_template_id: fc.constant(null),
  payment_intent_id: fc.option(fc.constant("pi_hold"), { nil: null }),
  balance_paid: fc.boolean(),
});

describe("Authorization hold (ADRs 0002, 0005, 0016, 0026)", () => {
  it("never captures more from the hold than was authorised", () => {
    fc.assert(
      fc.property(money(1, 2_000_000), money(0, 2_000_000), (finalAmount, authorized) => {
        const plan = planCapture(finalAmount, authorized);
        const fromHold = plan.kind === "capture" ? plan.amount : plan.holdCapture;
        expect(toCents(fromHold)).toBeLessThanOrEqual(toCents(authorized));
        expect(fromHold).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("the hold capture plus the Balance payment is exactly the final total", () => {
    fc.assert(
      fc.property(money(1, 2_000_000), money(0, 2_000_000), (finalAmount, authorized) => {
        const plan = planCapture(finalAmount, authorized);
        const sum = plan.kind === "capture" ? toCents(plan.amount) : toCents(plan.holdCapture) + toCents(plan.topUp);
        expect(sum).toBe(toCents(finalAmount));
        if (plan.kind === "top_up") expect(plan.topUp).toBeGreaterThan(0);
      }),
    );
  });

  it("over any sequence of events a Result captures at most once, and never after its hold is released", () => {
    fc.assert(
      fc.property(heldResult, fc.array(transition, { maxLength: 25 }), (start, events) => {
        let state = start;
        let captures = 0;
        let releases = 0;
        for (const event of events) {
          const out = transitionResult(state, event);
          if (!out.ok) continue;
          if (event.action === "capture") {
            expect(releases).toBe(0);
            captures += 1;
          }
          if (out.releaseHold) {
            expect(captures).toBe(0);
            releases += 1;
          }
          state = {
            ...state,
            status: out.status,
            filling_template_id: event.action === "assign" ? event.filling_template_id : state.filling_template_id,
          };
        }
        expect(captures).toBeLessThanOrEqual(1);
        expect(releases).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("a released or captured Result accepts no further event", () => {
    const every: Transition[] = [
      { action: "assign", filling_template_id: 1 },
      { action: "accept" },
      { action: "decline" },
      { action: "expire" },
      { action: "capture" },
      { action: "cancel" },
    ];
    fc.assert(
      fc.property(heldResult, fc.array(transition, { maxLength: 25 }), (start, events) => {
        let state = start;
        for (const event of events) {
          const out = transitionResult(state, event);
          if (!out.ok) continue;
          state = { ...state, status: out.status };
          if (out.releaseHold || out.status === "captured") {
            for (const after of every) expect(transitionResult(state, after).ok).toBe(false);
          }
        }
      }),
    );
  });

  it("a Result with neither a hold nor a paid Balance payment can never be captured", () => {
    fc.assert(
      fc.property(fc.constantFrom("held" as const, "assigned" as const, "accepted" as const), fc.array(transition, { maxLength: 25 }), (start, events) => {
        let state: ResultState = { status: start, filling_template_id: null, payment_intent_id: null, balance_paid: false };
        for (const event of events) {
          const out = transitionResult(state, event);
          if (!out.ok) continue;
          expect(event.action).not.toBe("capture");
          expect(out.releaseHold).toBe(false);
          state = { ...state, status: out.status };
        }
      }),
    );
  });

  it("the Order's settlement ledgers exactly the money the plan took, with no zero charge", () => {
    fc.assert(
      fc.property(
        money(1, 2_000_000),
        money(0, 2_000_000),
        fc.boolean(),
        (finalAmount, authorized, hasHold) => {
          const held = hasHold ? authorized : 0;
          const plan = planCapture(finalAmount, held);
          const holdCapture = plan.kind === "capture" ? plan.amount : plan.holdCapture;
          const topUp = plan.kind === "capture" ? 0 : plan.topUp;
          const s = settleResult({
            holdCaptureAmount: holdCapture,
            holdIntentId: hasHold ? "pi_hold" : null,
            topUpPaid: topUp,
            topUpIntentId: topUp > 0 ? "pi_topup" : null,
          });
          expect(toCents(s.amountCaptured)).toBe(toCents(finalAmount));
          expect(s.charges.reduce((t, c) => t + toCents(c.amount), 0)).toBe(toCents(finalAmount));
          expect(s.charges.every((c) => c.amount > 0 && c.stripeObjectId != null)).toBe(true);
          const fromHold = s.charges.filter((c) => c.stripeObjectId === "pi_hold");
          expect(fromHold.reduce((t, c) => t + toCents(c.amount), 0)).toBeLessThanOrEqual(toCents(held));
        },
      ),
    );
  });

  it("a Paired build's one hold is the sum of every held member's quote, and nothing when none was held", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            cents: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: null }),
            asText: fc.boolean(),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        (rows) => {
          const members = rows.map((r) => ({
            authorized_amount: r.cents == null ? null : r.asText ? String(r.cents / 100) : r.cents / 100,
          }));
          const intent = pairAuthorized(members);
          const held = rows.filter((r) => r.cents != null);
          if (held.length === 0) {
            expect(intent).toBeNull();
            return;
          }
          expect(toCents(intent!)).toBe(held.reduce((t, r) => t + r.cents!, 0));
        },
      ),
    );
  });

  it("ending the companion never releases the hold its anchor still needs, and ending the anchor releases it and ends an open companion", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"anchor" | "companion">("anchor", "companion"),
        fc.boolean(),
        fc.option(fc.constantFrom(...RESULT_STATUSES), { nil: null }),
        (ending, hasHold, partnerStatus) => {
          const me = {
            id: ending === "anchor" ? "a" : "c",
            paired_build_id: "a",
            payment_intent_id: hasHold ? "pi_pair" : null,
          };
          const partner = partnerStatus == null ? null : { id: ending === "anchor" ? "c" : "a", paired_build_id: "a", status: partnerStatus };
          const plan = endingPlan(me, partner);
          const partnerInPlay = partnerStatus != null && !ENDED.includes(partnerStatus);
          if (ending === "anchor") {
            expect(plan.releaseHold).toBe(hasHold);
            expect(plan.cascadeTo).toBe(partnerStatus === "held" || partnerStatus === "assigned" ? "c" : null);
          } else {
            expect(plan.cascadeTo).toBeNull();
            if (partnerInPlay && partnerStatus !== "captured") expect(plan.releaseHold).toBe(false);
            if (!partnerInPlay) expect(plan.releaseHold).toBe(hasHold);
          }
        },
      ),
    );
  });

  it("whatever order a Paired build's members end in, its one hold is released once both have ended and never before", () => {
    type Who = "anchor" | "companion";
    const step = fc.record({
      who: fc.constantFrom<Who>("anchor", "companion"),
      action: fc.constantFrom<Transition>(
        { action: "assign", filling_template_id: 7 },
        { action: "decline" },
        { action: "expire" },
        { action: "cancel" },
      ),
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 14 }), (steps) => {
        const state: Record<Who, ResultState> = {
          anchor: { status: "held", filling_template_id: null, payment_intent_id: "pi_pair" },
          companion: { status: "held", filling_template_id: null, payment_intent_id: "pi_pair" },
        };
        const row = { anchor: { id: "a", paired_build_id: "a" }, companion: { id: "c", paired_build_id: "a" } };
        let releases = 0;
        for (const { who, action } of steps) {
          const other: Who = who === "anchor" ? "companion" : "anchor";
          const out = transitionResult(state[who], action);
          if (!out.ok) continue;
          if (action.action === "assign") {
            state[who] = { ...state[who], status: out.status, filling_template_id: 7 };
            continue;
          }
          const plan = endingPlan(
            { ...row[who], payment_intent_id: state[who].payment_intent_id },
            { ...row[other], status: state[other].status },
          );
          state[who] = { ...state[who], status: out.status };
          if (plan.cascadeTo === row[other].id) state[other] = { ...state[other], status: out.status };
          if (plan.releaseHold) releases += 1;
          const bothEnded = ENDED.includes(state.anchor.status) && ENDED.includes(state.companion.status);
          expect(releases).toBe(bothEnded ? 1 : 0);
        }
      }),
    );
  });

  it("the partner a pair's reader picks is never itself and is still in play whenever one is", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...RESULT_STATUSES), { minLength: 1, maxLength: 4 }),
        fc.nat({ max: 3 }),
        (statuses, selfIndex) => {
          const members = statuses.map((status, i) => ({ id: `m${i}`, status }));
          const self = members[selfIndex % members.length].id;
          const picked = pickPartner(members, self);
          const others = members.filter((m) => m.id !== self);
          if (others.length === 0) {
            expect(picked).toBeNull();
            return;
          }
          expect(picked).not.toBeNull();
          expect(picked!.id).not.toBe(self);
          if (others.some((m) => !ENDED.includes(m.status))) expect(ENDED.includes(picked!.status)).toBe(false);
        },
      ),
    );
  });

  it("the companions Accept counts are exactly those other than the anchor that have not ended", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...RESULT_STATUSES), { minLength: 1, maxLength: 4 }), (statuses) => {
        const members = statuses.map((status, i) => ({ id: i === 0 ? "a" : `c${i}`, status }));
        const counted = liveCompanions(members, "a").map((m) => m.id);
        expect(counted).toEqual(members.filter((m) => m.id !== "a" && !ENDED.includes(m.status)).map((m) => m.id));
      }),
    );
  });

  it("Accept on a Paired build never takes along a companion that is still being built", () => {
    for (const status of [null, ...RESULT_STATUSES]) {
      const verdict = companionAtAccept(status == null ? null : { status });
      if (status === "held" || status === "accepted" || status === "captured") {
        expect({ status, ok: verdict.ok }).toEqual({ status, ok: false });
      } else {
        expect({ status, verdict }).toEqual({ status, verdict: { ok: true, include: status === "assigned" } });
      }
    }
  });
});
