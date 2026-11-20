# 05 — Property tests on money lifecycles

**Type:** AFK
**Blocked by:** none

## Goal

The invariants the ADRs state about money hold for generated inputs, not only
for the cases someone thought to write. Read first: `../agent-rails-prd.md`
(decision 7), `.claude/rules/money.md`, `docs/data-flows/`, and the ADRs for
each lifecycle below.

Add `fast-check` as a dev dependency (the one new dependency this PRD allows).

## Lifecycles

Find the pure functions that decide each one, and test those. Do not test
through a database or Stripe.

- **Returns / RMA** (ADR 0011; `lib/rma/transitions.ts`, `lib/rma/transition.ts`):
  from any reachable state, any sequence of events ends in a state the table
  allows; a terminal state accepts nothing; no sequence refunds more than was
  paid.
- **Authorization hold** (ADRs 0002, 0005, 0026; `lib/authorization-hold/`):
  never capture more than was authorised; a released or captured hold is not
  captured again; a paired build is one hold.
- **Loyalty points** (ADR 0030): no sequence of earning, redeeming, expiring
  and refunding leaves a balance below zero; a refund returns what the order
  redeemed and takes back what it earned, once.
- **Refunds** (ADR 0038): a refund is full items or an amount, never more than
  the order's remaining refundable total, across any sequence of refunds.

These are starting points. Where an ADR states an invariant more exactly,
test the ADR's version. Where a lifecycle has no pure function to test, say
so rather than testing a copy of the logic.

## Rules

- Tests only. Do not change code under a money path.
- **If a property fails on real code, stop.** Do not weaken the property and
  do not fix the code. Keep the counterexample (fast-check prints the seed and
  the shrunk input) and put it in your reply; the owner decides. Commit the
  properties that hold.
- Generators build inputs the real system can produce. A counterexample that
  needs an impossible input is a fault in the generator.
- The files are product code: no comments, per the PRD's rules.

## Done when

- `pnpm test <the new files>` passes; show the output with the number of
  properties and runs.
- For each property, show it can fail: break the invariant in a scratch edit
  of the code under test, run it, show the shrunk counterexample, revert.
- The reply lists, per lifecycle: the functions tested, the invariants and the
  ADR line each comes from, anything that could not be tested and why, and
  any counterexample found on real code.
