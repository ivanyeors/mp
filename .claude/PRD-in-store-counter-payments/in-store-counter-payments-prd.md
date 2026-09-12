# PRD: In-store Counter Payments — take the card at the fitting, not by email

Status: Draft (needs-triage)
Source: Planning session 2026-09-12. **Stripe Terminal** was one of three Stripe products named at the start of the Stripe workstream (Payments, Tax, Terminal); Payments shipped long ago, Tax is deliberately off until GST registration, and Terminal is the only one wholly unbuilt. A codebase audit during drafting changed the shape of the work twice: once when it falsified the assumption that this needs a new settlement path, and once when Stripe's own availability matrix ruled out the reader everybody reaches for first.
ADRs: `docs/adr/0017-in-store-counter-payments.md` (this initiative — a **Counter payment** is a **Balance payment** funded at the till); `docs/adr/0016-deferred-payment-for-assisted-builds.md` (the path this rides on — a **Result** with no hold is payable, and a full payment is a top-up from a hold of zero); `docs/adr/0002-authorize-then-capture-customised-goods.md` (the online default, and why in-store never had a hold); `docs/adr/0012-locations-unified-partner-model.md` (**Location** is a row on `partners`, which is where the **Terminal Location** id has to hang); `docs/adr/0001-costings-single-price-source.md` (**Staff** never type an amount, including at the till)
Glossary: `CONTEXT.md` — **Result**, **Order**, **Location**, **Staff**, **Authorization hold**, **Balance payment**, **Source**, **Costings**, **MSRP**, **Customer**, **Admin Panel**, **Assisted customisation**; new terms **Counter payment**, **Card reader**, **Terminal Location**, **Reader action**
Decisions taken before drafting: (a) **smart readers driven server-side only** — no client SDK, for the reason in *Constraints* below; (b) a **Counter payment** captures immediately, never authorizes; (c) **Staff** never type the amount — it is `loadAssignedBuild`'s `priceResult()`, the same number the emailed link would charge; (d) reader ids are never stored in our database, only the **Terminal Location** id; (e) refunds stay in the existing RMA flow and are explicitly out of scope; (f) build and demo the whole initiative against Stripe's **simulated reader**, so hardware blocks sign-off and nothing else.

## Problem Statement

A customer can stand in the shop, have their shoulders measured, watch **Staff** compose the pillow in the **X-ray editor**, agree to the price — and then has to be emailed a link and asked to go home and pay.

That is the literal state of the code. In-store measurement lands a **Result** through `buildInstoreReviewOnlyPatch` (`lib/results/instore-finalize.ts:39`) as `{ status: "held", payment_intent_id: null, authorized_amount: null, source: "manual" }`. ADR 0002 chose no **Authorization hold** for that path on purpose — nobody hands a walk-in a card form before their pillow has been designed — and PR #129 (ADR 0016) then made such a **Result** payable, so the dead end is gone. What replaced it is a **Balance payment** by hosted Checkout: `accept` computes `planCapture(finalAmount, 0)`, takes the `top_up` branch, and returns a `checkoutUrl` (`app/api/results/[id]/accept/route.ts:103`, `:130`). **Staff** press *Request payment* (`app/[lang]/settings/results/[id]/result-detail-client.tsx:925`) and the customer receives a priced email with a link.

For a remote **Assisted customisation** that is exactly right, and it is why ADR 0016 exists. For someone physically at the counter it is the wrong instrument for the moment. The build is finished, the price is agreed, the customer is holding a wallet, and the system's answer is *check your email*. Every such handover carries the risk of the whole sale: a link that goes unread, a card that gets used somewhere else first, a decision that cools between the shop and the sofa. The code even knows the customer is standing there — `accept` stamps the **Order** `delivered` with `delivered_at = now` the moment it settles, because `inStoreHandover` is true when `source === "manual"` or there is no shipping address (`app/api/results/[id]/accept/route.ts:247,268`). The system understands the pillow changes hands at the counter. It just cannot take money there.

The second half of the problem is that nothing in the codebase can talk to a card reader. `grep -r card_present` returns nothing. The **Stripe** webhook handler implements nine events (`app/api/stripe/webhook/route.ts`) and not one is a Terminal event. `lib/authorization-hold/index.ts` is the only module that creates PaymentIntents and it hardcodes `automatic_payment_methods: { enabled: true }`, which is the correct default for every online path and is mutually exclusive with the one parameter a Terminal payment requires.

### Constraints found while researching, which decide the build

Three findings from Stripe's documentation changed the shape of this initiative. They are recorded here because each one closes off an approach that looks obvious.

**1. Tap to Pay is unavailable to this application, despite being available in Singapore.** Stripe's availability matrix lists both Tap to Pay on iPhone and Tap to Pay on Android as live in SG. It is the option anybody would pick — no hardware to buy, staff use the phone in their pocket. It is also unreachable: Tap to Pay is offered *only* through the iOS, Android and React Native SDKs. `mp` is a Next.js web application. Reaching Tap to Pay means shipping a native mobile app, which is a larger project than this one and would duplicate an **Admin Panel** that already works on a handset. Ruled out on platform, not on merit.

**2. The JavaScript SDK is the wrong tool even though it is the web one.** Stripe's own guidance, printed at the top of both the JS collect-payment and JS setup pages, is *"For smart readers … we recommend using the server-driven integration instead of the JavaScript SDK."* The JS SDK requires the browser and the reader to sit on the same local network with working local DNS, and since Chrome 142 (October 2025) it additionally requires the operator to grant an explicit local-network permission prompt. That is a support burden on a shop's WiFi for no gain.

**3. The server-driven integration is the one that fits, and it happens to be the smallest.** It drives WisePOS E, Stripe Reader S700/S710 and Verifone V660p/P630 entirely through the Stripe API from a backend — no client SDK of any kind, no local network relationship between the **Admin Panel** and the reader, both simply talking to Stripe. That is precisely the shape of every other payment in this codebase. It also ships a **simulated reader**, so the entire integration is buildable and testable with no hardware, which is what lets seven of the eight slices below run AFK.

Two constraints ride along with that choice and must be designed for rather than discovered:

- **`payment_method_types` must be passed explicitly and must include `card_present`.** This is the single documented exception to the dynamic-payment-methods rule the rest of the codebase follows without exception, and it cannot coexist with `automatic_payment_methods`.
- **Reader actions are asynchronous.** `process_payment_intent` returns HTTP 200 to mean *the reader accepted the instruction*, not *the customer paid*. The outcome arrives by `terminal.reader.action_succeeded` / `terminal.reader.action_failed` webhook, which Stripe's deployment checklist lists as **required** for server-driven integrations rather than optional. A UI that treats 200 as success is wrong in the one direction that matters.

A third constraint bounds a tempting variation: **a `card_present` manual-capture authorization expires in two days, not the seven an online hold gets.** That is a strong argument against ever authorizing at the counter, and the reason decision (b) exists.

## Solution

From a **Staff** perspective: the same **Result** detail page, the same *Save assignment*, and then a second button beside *Request payment* that reads **Charge at the counter — SGD 460.00**. Press it and the reader on the desk wakes with the amount on its screen. The customer taps or inserts. The page says *Approved*, the **Order** appears in the queue already marked delivered, and the customer walks out with the pillow. If the card is declined the page says so in words a person can act on, and the same button charges again without creating a second payment. If the reader is offline it says that *before* the customer is brought over, and *Request payment* is still sitting there as the fallback that has always worked.

From a customer perspective: nothing to install, nothing to check later. They tap a card, or they pay with **PayNow** from the reader's screen, and an emailed receipt arrives from Stripe.

From a developer perspective this is a new funding instrument for a settlement path that already exists, and almost nothing else. The insight that keeps it small:

> **A Counter payment is a Balance payment whose card happened to be present.**

`accept` already settles a **Result** whose top-up was paid out-of-band. When the hosted Checkout webhook sees `metadata.purpose === "result_topup"` it stamps `topup_payment_intent_id` and `topup_paid_at` on the **Result** (`app/api/stripe/webhook/route.ts:104-117`), and `accept` then finds those columns, retrieves the intent, confirms `status === "succeeded"` and the amount covers the plan, and settles without charging again (`app/api/results/[id]/accept/route.ts:109-124`). That branch exists because a customer once paid and closed the tab. It is exactly the branch a counter charge needs.

So a **Counter payment** is a PaymentIntent carrying the same `{ result_id, purpose: "result_topup" }` metadata, funded by `card_present` on a reader instead of by a hosted Checkout page. When it succeeds, the webhook stamps the same two columns. `accept` settles it with **no changes at all** — same `planCapture`, same capture skip for a zero hold, same `transitionResult` guard requiring `balance_paid`, same **Order** writer, same money ledger, same inventory deduction, same `delivered` stamp. The **Order** that comes out is indistinguishable from one paid by link, which is the point: there is one sale per **Result** and one way to record it.

What that buys: no new settlement code, no second **Order** writer, no new stuck-state vocabulary (`topup_unsettled` already describes a counter payment that took money without producing an **Order**, and the Results queue already surfaces it), and no change to refunds, disputes or RMA, all of which operate on the charge and neither know nor care which instrument produced it.

What genuinely has to be built: one nullable column, one new PaymentIntent factory that passes `card_present`, two new webhook cases, one poll endpoint, one button with an honest state machine, and a reader registry screen. That is the whole initiative.

What ships:

1. Glossary entries for **Counter payment**, **Card reader**, **Terminal Location** and **Reader action**, and ADR 0017 — with a disambiguation that matters more than it looks, because "terminal" is already taken in this codebase.
2. A **Terminal Location** per **Location**, created from the address already on the row, and a live reader list read from Stripe rather than cached.
3. The charge itself, end to end against a simulated reader: `card_present` PaymentIntent → **Reader action** → webhook → **Order**.
4. The **Staff** control, with the async truth rendered honestly: waiting, approved, declined, cancellable.
5. Failure honesty: a reader preflight, a retry that reuses the intent, and reconciliation for money taken without an **Order**.
6. **PayNow** at the counter, and receipts.
7. Ops: a kill switch, reader fleet health, and an audit trail.
8. A human pass with real hardware, a real card and real Singapore dollars.

## User Stories

### Taking the payment

1. As **Staff**, I want to charge the agreed price on a card reader from the **Result** I just assigned, so that a customer standing in front of me can pay before they leave.
2. As **Staff**, I want the amount to come from the build I composed, so that I never key in a number and never charge the wrong one.
3. As **Staff**, I want the reader to show the amount before the customer taps, so that they can see what they are agreeing to.
4. As **Staff**, I want the page to tell me when the payment is approved, without refreshing, so that I know when to hand over the pillow.
5. As **Staff**, I want a declined card explained in words I can say out loud, so that I can ask for another card without reading an error code to a customer.
6. As **Staff**, I want to retry a declined payment on the same charge, so that a second attempt cannot become a second charge.
7. As **Staff**, I want to cancel a payment the reader is still waiting on, so that a customer who changes their mind does not leave the reader stuck.
8. As a customer at the counter, I want to pay with **PayNow** instead of a card, so that I can use the method I use everywhere else in Singapore.
9. As a customer at the counter, I want an emailed receipt, so that I have proof of a purchase that produced no shipping confirmation.

### Knowing it will work before the customer is there

10. As **Staff**, I want to see that the reader is online before I start, so that I do not discover it is offline with a customer watching.
11. As **Staff**, I want *Request payment* to remain available, so that a dead reader costs me a link instead of a sale.
12. As **Staff**, I want to know which reader I am about to charge on when there is more than one in the shop, so that the right screen lights up.

### Setting it up and keeping it honest

13. As an **Owner**, I want each **Location** registered with Stripe from the address already on it, so that setting up a second shop is not a developer task.
14. As an **Owner**, I want to register a new reader by typing its pairing code, so that replacing broken hardware does not need a deploy.
15. As an **Owner**, I want to turn counter payments off for everyone, so that a Stripe or hardware problem does not need a code change.
16. As an **Owner**, I want every counter charge attributed to the **Staff** member who took it, so that a disputed transaction has a name against it.
17. As **Staff**, I want a counter payment that took money but produced no **Order** to appear as stuck, so that no customer pays and goes home empty-handed.

## Non-goals

Stated because each one is a plausible next request and none of it is in these eight slices.

- **Tap to Pay on any device.** Ruled out on platform (see *Constraints*). Revisiting it means a native app.
- **Refunds at the reader.** Terminal can collect a refund payment method, but this codebase already has a whole RMA lifecycle (ADR 0011) that refunds against the charge. A second refund surface would be a second source of truth for the same money.
- **Selling accessories at the till as a standalone basket.** A **Counter payment** settles a **Result**. A walk-in buying only an ear pad is a shop **Order**, which is a different and much larger change to `/api/shop/checkout`.
- **Tipping.** Stripe supports on-reader tips in the US only.
- **Offline card payments.** Explicitly unsupported by the server-driven integration.
- **Cash.** Recording a cash sale means an **Order** with no Stripe charge, which touches the money ledger's assumptions. Worth doing; not here.
- **A second editing surface.** `lib/spatial-fillings/surface-parity.check.ts` forbids a fourth **X-ray editor** mount and this initiative adds none.

## Constraints and risks

| Risk | Mitigation |
|---|---|
| Hardware must be bought before anything can be signed off | Every slice but 08 builds and tests against the simulated reader. Order the reader on day one; it does not block the build. |
| `card_present` forces explicit `payment_method_types`, breaking the codebase's one rule about not doing that | Confined to a new factory in `lib/counter-payment/`. `lib/authorization-hold/index.ts` is untouched, so no online path can inherit it. A self-check asserts the separation. |
| A 200 from `process_payment_intent` read as success would show *Approved* for an unpaid order | The UI never derives success from the create call. Terminal state comes from the webhook or the poll, both of which read Stripe. |
| Staff double-pressing *Charge* creates two PaymentIntents | Idempotency key derived from Result id and amount, matching the existing `result-topup-${id}-${amount}` shape, plus reuse of a live intent on retry. |
| A payment succeeds and the Order write fails | Already survivable: `accept` is retryable by construction, and `topup_unsettled` surfaces the Result as stuck. Slice 05 adds the sweep. |
| Singapore is SGD-only and the reader's **Terminal Location** must be in SG | Registration validates the country before creating the Stripe Location; currency comes from the **Result** and is already SGD. |
| Two-day capture window on `card_present` authorizations | Never authorize. Decision (b): counter payments capture immediately. |
| The word "terminal" already means a rules-engine leaf node (`firedTerminals`, `lib/rules-engine/evaluate.ts:75`) | Slice 01's glossary forbids the bare noun. The domain term is **Card reader**; "Terminal Location" appears only as the name of the Stripe object. |

## Success criteria

- A **Staff** member can take a card payment for an assigned **Result** without leaving the **Result** detail page, and the resulting **Order** is byte-for-byte the shape of one paid by link.
- A declined card, a cancelled action and an offline reader each produce a message a shop assistant can act on, and none of them can produce an **Order**.
- No counter payment can charge a customer twice, under retry, double-press, or a mid-payment page reload.
- Money taken with no **Order** behind it appears in the Results queue as stuck within one cron cycle.
- Counter payments can be switched off from the **Admin Panel** with no deploy.
- `npm run ci` green: lint, typecheck, the full vitest suite, `next build`, route budgets, and the new `lib/counter-payment/*.check.ts`.
