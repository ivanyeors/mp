# A Paired build is two Results under one Authorization hold, accepted together into one Order

When the Premium or Basic **Rule graph** fires a **Flow route** to Mbolster, the shopper can add an
Mbolster to the Mpillow they are buying, and pays once. The two builds stay two **Results**, because
each one is assigned, priced and built on its own. They share one **Authorization hold**, they are
accepted together, and they become one **Order**.

## Context

The cross-sell was modelled as a **Flow route** like the Basic → Premium upsell, but those *replace*
the product. Pillow → bolster *adds* one. The owner chose one payment for both (2026-10-19) over two
checkouts in a row.

Everything downstream of the hold assumes one Result per PaymentIntent:

- Stripe captures a manual-capture PaymentIntent **once**. Accept reads an already-`succeeded` intent
  as "a previous attempt of this Result captured", so a second Result accepting on the same intent
  would skip capture and make an Order with no money behind it.
- Decline, cancel, expiry and delete each release the hold. Releasing cancels the whole intent, so
  ending one Result would void the other's payment too.
- `order_payments` is unique on `stripe_object_id`, and the refund, dispute and failure webhooks look
  an Order up by `payment_reference` with `single()`. Two Orders on one intent break both.

## Decision

- **Link.** `mp_config_responses.paired_build_id` holds the **anchor**'s id on both rows. The anchor
  is the Mpillow Result. The Mbolster Result is its **companion**. An unpaired Result has null and
  behaves exactly as before.
- **Hold.** One request creates both rows and one Checkout. The Checkout has a line per product, and
  its amount is the sum of the two `authorized_amount`s. Each row quotes only its own build.
  The intent id is written on both rows only when the session total equals that sum.
- **Shipping is charged once, on the anchor.** The companion rides in the same shipment, so every
  repricing site prices its shipping at zero. Tax is still computed on its goods.
- **The anchor anchors.** Declining, cancelling or expiring the anchor ends the companion too, and
  releases the hold. Declining or cancelling the companion leaves the anchor and its hold untouched.
  A companion is never left on its own with no shipping charged.
- **No dropping a build after money has moved.** Once a Balance payment has been paid for the pair,
  or the shared intent has been captured by an Accept that then failed, the companion can no longer
  be removed on its own. Accept the pair, then refund the line.
- **Accept is one act.** It runs on the anchor and takes the companion along when the companion is
  `assigned`. It refuses while the companion is still `held`, and leaves out a companion that has
  ended. It claims both rows, then captures once: the sum of the live finals against the whole
  intent. Stripe releases what is not captured, which is how a dropped Mbolster is never charged.
  A Balance payment covers anything above the hold, exactly as for one Result. When the money and
  the builds disagree — a paid Balance payment that no longer covers the pair's top-up, or an intent
  already captured for a different amount — Accept stops with a 409 and leaves it to Staff, rather
  than refunding or charging the difference on its own.
- **One Order.** That one Order carries a goods line, plus service lines, for each accepted Result.
  The intent stays one-to-one with an Order, so the ledger, refunds, RMA and dispute handling are
  unchanged. Both Results point at the Order.

## Considered options

- **Two checkouts, one after the other.** No money-path change, but the owner wants one payment.
- **One Result holding both products.** A Result has one **Composed sellable**, one filling
  snapshot and one assign flow. Teaching every one of those about a second product is far larger
  than linking two Results.
- **Two Orders on one intent.** Splits one captured charge across two Orders, which collides with
  the unique ledger row and every `payment_reference` lookup.
- **Stripe multicapture.** Would let each Result capture on its own, but it is not available on
  every card network and adds a second settlement path.

## Consequences

- A Paired build waits for both builds to be assigned before the shopper can accept. Staff see the
  companion in the queue like any other Result.
- The companion's `authorized_amount` is its own quote, not the intent's amount. Anything reading the
  intent's capacity sums the pair.
- A companion dropped at Accept is `declined` with no release call. Capturing less than the whole
  intent is what frees its share.
- Free-shipping thresholds read the anchor's goods alone, not the pair's.
- A re-hold of the same Mpillow unlinks a companion that has ended, so a pair has at most one
  companion that counts. Readers still pick the live one, should two rows ever share an anchor.
- The Checkout session names its companion and that companion's quote in metadata, so attaching
  the card still checks the full amount if the companion is deleted before Checkout completes.
- v1 creates Paired builds only on the card path (or with holds switched off), never from an
  **Assisted customisation**.
- The stepper customises both builds before it asks for anything else: **1 Mpillow · 2 Mbolster
  (optional) · 3 Details · 4 Review** (owner, 2026-10-23). Step 2 is the Mbolster configurator
  itself, in paired mode, reached through a `sessionStorage` hand-off (`mp_paired_build_handoff`).
  It asks only for height, since sleep position carries over, then shows its own customisation
  page: case and add-ons online, plus the **X-ray editor** under **Staff assist mode**, so a Staff
  mix for the companion goes in with the same hold. Add or Skip hands its answer back to the
  Mpillow page, which owns steps 3 and 4 because a pair's contact, address and shipping are the
  anchor's: contact and shipping (quoted for both boxes), then a summary of both builds, delivery
  and contact, each with its way back to change it. The one hold is sent from that summary. Skip,
  on either page, goes on to step 3 without the Mbolster.
