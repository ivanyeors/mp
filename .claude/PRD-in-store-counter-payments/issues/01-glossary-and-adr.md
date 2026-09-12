# 01 — Domain glossary and ADR 0017: Counter payment, Card reader, Terminal Location

**Type:** AFK
**Blocked by:** none
**User stories:** underpins all
**Labels:** `documentation`, `needs-triage`, `P2`, `area:checkout`

## Why this is first

Two of the nouns this initiative introduces sit on top of words that already mean
something specific in this codebase, and one of them is load-bearing.

**"Terminal" is already taken.** `lib/rules-engine/evaluate.ts:75` builds
`firedTerminals: FiredTerminal[]`, and every persisted `recommendation_record`
carries a `firedTerminals` array naming the leaf nodes that produced a size and
tier recommendation. A developer reading "the terminal fired" in this repository
is reading about the rules engine, not about payments. If this initiative adopts
the bare noun, every future grep for either concept returns both.

**"Location" is already a row on `partners`.** ADR 0012 unified partners and
locations onto one table, so `LocationRow = PartnerRow` (`lib/locations/index.ts:8`)
and a **Location** is a physical place we or a partner operates. Stripe has its own
`terminal.Location` object, which is a different thing with a different id space and
a hard requirement that its address country match the account's. These must not be
allowed to blur, because the distinction is exactly where slice 02's migration lives.

## Deliverable

### `CONTEXT.md` additions

**Counter payment**
: A payment taken from a customer who is physically present, on a **Card reader**,
settling a **Result** whose build is already assigned and priced. Mechanically a
**Balance payment** (ADR 0016) whose PaymentIntent was funded by `card_present`
rather than by a hosted Checkout page — it carries the same
`purpose: "result_topup"` metadata and settles through the same `accept` route.
Always captured immediately, never authorized.
: _Avoid_ "terminal payment", "POS payment", "in-person checkout". The first
collides with the rules engine, the second implies a point-of-sale system this
codebase does not have, and the third implies a Checkout Session, which a
**Counter payment** has none of.

**Card reader**
: The physical device that prompts the customer and reads their card — a Stripe
Reader S700/S710, BBPOS WisePOS E or Verifone V660p/P630. Always driven
server-side through the Stripe API; this codebase ships no Terminal client SDK
and no native app, so mobile readers and Tap to Pay are out of reach by
construction.
: _Avoid_ "terminal" (collides with `firedTerminals`), "POS terminal", "the
machine".

**Terminal Location**
: The Stripe `terminal.Location` object that a **Card reader** must be registered
against. One per **Location**, created from the `address` and `postal_code`
already on that row, and referenced by `partners.stripe_terminal_location_id`.
Its country must match the Stripe account's, which for MELLOW LIFE means every
**Terminal Location** is in Singapore and every **Counter payment** is in SGD.
: _Avoid_ using "Location" alone for this. A **Location** is ours; a **Terminal
Location** is Stripe's mirror of it. The two-word form is mandatory.

**Reader action**
: One instruction sent to a **Card reader** — process a payment, cancel. Resolves
**asynchronously**: the API call returns HTTP 200 to acknowledge that the reader
accepted the instruction, and the outcome arrives later as
`terminal.reader.action_succeeded` or `terminal.reader.action_failed`. A 200 from
`process_payment_intent` does not mean the customer paid, and nothing in this
codebase may treat it as though it does.
: _Avoid_ "reader request", "charge attempt" — both read as synchronous.

### `docs/adr/0017-in-store-counter-payments.md`

An extension of ADR 0016 rather than an amendment to it: 0016 established that a
**Result** with no **Authorization hold** is payable and that a full payment is a
top-up from a hold of zero. 0017 adds that the top-up's funding instrument is
interchangeable, and that a card at the counter is one such instrument.

Decisions to record, each with its reasoning:

1. **Server-driven integration, smart readers only.** Tap to Pay and mobile
   readers require a native SDK and this is a web application; the JavaScript SDK
   requires reader and browser on one local network with working local DNS, plus
   an explicit local-network permission prompt on Chrome 142+. Server-driven has
   neither constraint and is Stripe's own recommendation for smart readers.
2. **A Counter payment captures immediately.** A `card_present` manual-capture
   authorization expires in **two days**, against seven for an online hold, and
   there is nothing to wait for: the build is assigned, the price is agreed, the
   customer is present, and the **Order** is born `delivered` anyway.
3. **The metadata contract is reused, not extended.** `{ result_id, purpose:
   "result_topup" }` is what the existing webhook branch already recognises. A new
   `purpose` value would fork the settlement path this initiative exists to avoid
   forking.
4. **Reader ids are never persisted.** Only `stripe_terminal_location_id` is
   stored. Readers are hardware that is replaced, swapped between shops and
   RMA'd; a cached id is a staleness bug, and Stripe can already list readers by
   location on demand.
5. **`payment_method_types` is passed explicitly, in one module only.** This is
   the sole documented exception to the dynamic-payment-methods rule the rest of
   the codebase follows, so it is confined to `lib/counter-payment/` and
   `lib/authorization-hold/index.ts` is not touched.
6. **Refunds stay in RMA.** ADR 0011 owns the refund lifecycle and operates on the
   charge, which is instrument-agnostic.

## Acceptance criteria

- [ ] `CONTEXT.md` carries all four terms with `_Avoid_` lines, placed with the
      other money vocabulary rather than in a new section.
- [ ] The **Counter payment** entry states that it is a **Balance payment** and
      names ADR 0016, so the relationship is discoverable from either end.
- [ ] `docs/adr/0017-in-store-counter-payments.md` exists with all six decisions
      and their reasoning, and links ADR 0016, 0012 and 0002.
- [ ] ADR 0016 gains a one-line forward reference to 0017.
- [ ] No file outside `CONTEXT.md` and `docs/adr/` is modified.

## Notes

The `_Avoid_` lines are the deliverable, not decoration. The "terminal" collision
is real and already in persisted data (`recommendation_record.firedTerminals` on
every **Result**), so it cannot be renamed away later.
