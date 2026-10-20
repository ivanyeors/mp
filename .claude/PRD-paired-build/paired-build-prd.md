# PRD: Paired build — add an Mbolster to an Mpillow, pay once

Status: In progress (2026-10-19)
Source: owner request on the "Your Custom Mpillow" preview — "if the nodes show a mbolster upsell,
show it as a stepper 1 & 2 where 1 is pillow and 2 is bolster that can be skippable"; owner chose
**one payment for both** over two checkouts.
ADR: `docs/adr/0026-paired-build-one-hold.md`
Glossary: `CONTEXT.md` — **Paired build**, **Result**, **Authorization hold**, **Balance payment**,
**Order**, **Flow route**, **Rule graph**

## Problem Statement

The Premium Rule graph carries a Flow route to Mbolster ("You already sleep with a bolster — pair
it with an Mbolster sized to you."), but nothing could act on it. The configurator's Upsell card
only knew how to *switch* flows (Basic → Premium). Upgrade did nothing for an Mbolster target, and a
pending route blocked the hold, so wiring the node on the canvas would have stranded shoppers.
There was also no way to buy a pillow and a bolster in one payment: every hold, capture, release,
Order and refund assumed one Result per PaymentIntent.

## Solution

When the evaluated graph routes to Mbolster, the preview becomes a two-step stepper:
**1 Mpillow** → **2 Mbolster (optional)**. "Next: Mbolster" takes the shopper to the Mbolster
configurator in paired mode. It asks only what the Mbolster flow needs that the pillow did not,
which is height, then opens the Mbolster's own customisation page: recommended length and price,
case, add-ons, and the Staff x-ray editor in store. It offers **Add Mbolster** or **Skip**. Skip
holds the pillow exactly as today. Add holds a **Paired build**: two Results under one
Authorization hold and one Stripe Checkout. Staff assign each build
as usual. The shopper accepts both together on one status page, may drop the Mbolster there, and
gets one Order.

## User Stories

1. As a shopper whose answers fire the Mbolster route, I want to see that my pillow is step 1 of 2
   and the bolster is an optional step 2, so that I know I can skip it.
2. As that shopper, I want step 2 to ask only for my height and a case, so that adding a bolster is
   quick.
3. As that shopper, I want to see the recommended Mbolster length and its price before adding it.
4. As that shopper, I want one card authorization for both, so that I pay once.
5. As a shopper who skips step 2, I want my pillow held exactly as before.
6. As a shopper, I want to accept both builds together once they are ready, so that I confirm once.
7. As a shopper, I want to drop the Mbolster when I review the final builds without losing my
   pillow, and never be charged for it.
8. As a shopper, I want to be charged shipping once, because both ship together.
9. As Staff, I want each build in the queue as its own Result, linked to its pair, so that I assign
   fillings with the tools I already use.
10. As Staff, I want cancelling the pillow to cancel the pair, and cancelling the bolster to leave
    the pillow alone.
11. As the business, I want one Order per payment, so that refunds, RMA, disputes and the money
    ledger keep working unchanged.

## Implementation Decisions

See ADR 0026 for the money-path rules: anchor and companion, a shared hold, shipping once,
anchor-led endings, one accept, one capture and one Order.

- **Schema:** `mp_config_responses.paired_build_id uuid` (the anchor's id, on both rows), indexed.
  Additive and nullable. An unpaired Result is untouched.
- **Pure rules:** `lib/results/paired-build.ts`. It holds the anchor test, liveness, the ending
  plan (cascade/release), the shipping-rides-with-anchor test and the pair's authorized total. The
  routes only do I/O.
- **Hold:** `POST /api/results/hold` takes an optional `pairedBolster` (`responseId`,
  `suggestedLength`, `measurements`, `preferenceLines` [case], `addonLines`,
  `recommendationRecord`). Only a pillow hold that is not deferred can carry one. Both rows share
  the anchor's access token, contact, address and shipping method. A re-submit that drops the
  bolster deletes the old companion, which never took money. A re-submit also unlinks any ended
  companion of the same anchor, so a pair only ever has one companion to read.
- **Attach:** `attachHoldPaymentIntent` compares the session total with the anchor's quote plus
  the companion named in the session metadata (`paired_result_id`, with `paired_result_amount` for
  one deleted since), and writes the intent onto both rows under the same check-and-set. A session
  that names no companion is compared with the members still waiting for a card.
- **Endings:** decline, cancel, the SLA cron and Result delete all go through the ending plan. The
  Mbolster can no longer be removed on its own once money has moved for the pair — a Balance
  payment paid, or the shared intent captured (409 `pair_paid`). When an Mbolster ends while the
  Mpillow carries on, the customer gets the "Mbolster removed" email, never "hold released"; if the
  Mpillow is already assigned it doubles as its "ready" email.
- **Accept:** the route generalises to members (one for an unpaired Result, two for a pair). It
  claims all members, captures once, writes one Order with lines per member, ledgers once, and
  deducts stock and books commission per member. It refuses rather than settles when money and
  builds disagree: a paid Balance payment that no longer matches the pair's top-up (409
  `paid_mismatch`), or an intent already captured for an amount other than this capture (409
  `capture_mismatch`). Staff settle those from the queue alarms.
- **Status page:** shows both builds and the pair total, accepts on the anchor, and offers "Remove
  Mbolster" (decline the companion) once it is assigned. The assigned email waits until no member is
  still `held`, and the SLA sends no payment reminder for an anchor whose companion is still `held`.
  Every reader picks the live partner when a pair ever has more than one companion row.
- **Configurator:** the stepper replaces the Upsell card when the route targets Mbolster. Step 1's
  "Next: Mbolster" validates the Mpillow's finish, writes its hold body to `sessionStorage`
  (`mp_paired_build_handoff`, with a stable companion id), and opens `/mbolster-config?paired=1`.
  Paired mode never reads or writes that device's standalone Mbolster draft. It asks height only,
  hides contact and shipping, and sends `pairedHoldBody(handoff, bolster)`: the Mpillow's body,
  route answered, plus the Mbolster with its Staff mix. Back returns to the Mpillow preview, which
  restores itself. A cancelled Checkout returns there too, and the hand-off keeps the Mbolster's
  answers.
- **Rollout gate:** the Premium **draft** graph wires `uses_bolster = true` into `route-mbolster`
  (`in-bolster` → `m-bolster` → route; `lib/rules-engine/__tests__/mbolster-route.test.ts`). Nothing
  reaches this flow until that draft is published, which must wait for this code to deploy: the
  code before it shows an upsell card for the route whose Add button does nothing, and holds the
  Mpillow's checkout until the shopper declines it.

## Testing Decisions

- Vitest for the pure rules (endings, amounts, shipping) and the accept route's exactly-once suite
  (a pair makes one Order with two goods lines and one capture; companion held → 409; companion
  declined → anchor-only capture).
- Hold route and attach: pair rows, Checkout amount and line items, amount-mismatch refusal.
- `*.check.ts` for the stepper's wiring.
- `app/api/results/__tests__/paired-build.e2e.test.ts`: the whole pair end to end against an
  in-memory Supabase and Stripe — hold, attach, assign, accept, every ending, the SLA cron, re-holds,
  removal after money has moved, and mismatched captures.

## Out of Scope

- Paired builds from an Assisted customisation (deferred) or a Staff re-configuration.
- Pairing on the Basic → Premium upsell, or more than two Results.
- Free shipping earned by the pair's combined goods.
