# PRD: Staff-Assisted Customisation — a link instead of a card, and a build that can be paid for afterwards

Status: Draft (needs-triage)
Source: Planning session 2026-09-11 — **Staff** need to send a customer a customisation link, compose the build themselves, and collect payment at the end. A codebase audit during drafting falsified the premise that this needs a new money path: the no-hold **Result**, the guest no-card submit, the customer status page and the pay-by-Checkout mechanism all already exist on `main` and are dead-ended by three guards.
ADRs: `docs/adr/0016-deferred-payment-for-assisted-builds.md` (this initiative — a **Result** with no hold is payable); `docs/adr/0002-authorize-then-capture-customised-goods.md` (the default path this amends, and the origin of the nullable `payment_intent_id`); `docs/adr/0001-costings-single-price-source.md` (the amount is never typed by **Staff**); `docs/adr/0008-spatial-filling-placements.md` (the spatial snapshot written at assign)
Glossary: `CONTEXT.md` — **Result**, **Draft Result**, **Result access token**, **Owner**, **Authorization hold**, **Staff**, **Staff assist mode**, **Partner-assisted customisation**, **Admin Panel**, **Customisation session**, **Filling Template**, **Filling configuration**, **Composed sellable**, **Costings**, **MSRP**, **Order**, **Source**, **Customer**, **Customer preference**, **Add-on**, **Pre-order**, **Location**; new terms **Assist link**, **Assisted customisation**, **Balance payment**
Decisions taken before drafting: (a) **Staff** finish the build on the **Result** detail assign card, which already mounts the unified **X-ray editor** — no fourth editing surface, because `lib/spatial-fillings/surface-parity.check.ts` forbids one; (b) the **Assist link** is a reusable per-**Staff** code mirroring `?partner=<code>`, not a single-use pre-minted session; (c) the amount is `priceResult()` at assign with no **Staff** override; (d) an unpaid build produces reminders and a human cancel, never an auto-expiry; (e) premium **Mpillow** only — basic and **Mbolster** are untouched.

## Problem Statement

There is exactly one way to buy a premium **Mpillow**, and it demands a card from a stranger.

A shopper opens `/mp-config` alone, answers eight measurement questions, reaches the **Your Custom Mpillow** preview, and is asked for card details before any **Staff** member has looked at the measurements. ADR 0002 chose that deliberately — charging at submission would bill for an unreviewed configuration — and softened it with an **Authorization hold**: the card is authorized, not charged, and capture waits until the customer accepts the assigned build.

That describes a shopper who arrived alone and is ready to commit. It does not describe how most premium pillows are actually sold. **Staff** meet people — in a clinic, at a studio, over WhatsApp — talk them through what a custom pillow is, and want to send them a link. The customer answers the questions on their own phone, on their own time. **Staff** then compose the real build in the **X-ray editor**, against those measurements and often against a **Reference photo** of the pillow the customer sleeps on today. Only then is there a price worth quoting, and only then is there something worth paying for.

Today that journey stops dead twice.

**It stops at the preview.** The primary call to action is a card. There is a secondary *"Save without purchasing"* button (`app/[lang]/mp-config/mp-config-client.tsx:2192`) — not **Staff**-gated, usable by any guest — which POSTs `persistContact: true` and lands a **Result** through `buildInstoreReviewOnlyPatch` (`lib/results/instore-finalize.ts:39`): `{ status: "held", payment_intent_id: null, authorized_amount: null, source: "manual" }`. So a no-card submit already exists. It is presented as an afterthought, it labels a remote customer as an in-store walk-in, and what it produces cannot be sold.

**It stops again at the money.** `lib/results/result-stage.ts:88` files every no-hold `held` **Result** as **stuck**, with the reason spelled out in the source: `measurement_residue` — *"In-store measurement-only Result. Legitimate, but it sits in `held` forever and clutters the queue until someone closes it."* Three guards hold it there:

| # | Guard | Location |
|---|---|---|
| 1 | `accept` and `capture` refuse a **Result** with no `payment_intent_id` | `lib/result-lifecycle/index.ts:52,84` |
| 2 | `planCapture` throws unless the authorized amount is positive; `accept` 400s on a null hold | `lib/authorization-hold/index.ts:113`, `app/api/results/[id]/accept/route.ts:98` |
| 3 | the "your final build is ready" email is skipped when there is no hold | `app/api/results/[id]/assign/route.ts:477` |

The customer-facing dead end is literally rendered. `app/[lang]/results/[id]/page.tsx:429` carries a branch for `status === "assigned" && !hasPaymentHold` whose copy reads *"This in-store measurement is for operator review only. Complete the online purchase path when you are ready to authorize payment"* — shown against a build **Staff** have already composed and priced, and which nobody can pay for.

Two smaller holes complete the picture. The SLA cron `continue`s on `!row.payment_intent_id` and selects `status = 'held'` only (`app/api/cron/results-sla/route.ts:111`), so a submission with no hold produces no reminder to anyone, ever, and an `assigned` **Result** awaiting payment is not scanned at all. And `mp_config_responses.source` has three values, none of which distinguishes a remote **Staff**-originated session from a walk-in.

What is *not* a problem, and was assumed to be at the start of drafting: the editing surface. PR #117 unified the **X-ray editor** across all three surfaces, and the **Result** detail assign card already mounts the same editor as the configurator. *"Save assignment"* already transitions `held → assigned`, writes the **Filling configuration** snapshot, computes `final_amount` via `priceResult()` and emails the customer. **Mark-ready already exists; it is called Save assignment.** What is missing beside it is a way to ask for money.

## Solution

From a **Staff** perspective: copy one link, once. Send it to anyone. The customer answers the questions you would have asked them, on their own phone, and the submission arrives in the **Results** queue under **Needs assign** with their name and measurements on it. Open it, build the pillow in the same **X-ray editor** you already use, hit Save assignment, and the customer gets a priced email. When they pay it becomes an **Order** in the same queue as every other order, built and shipped the same way.

From a customer perspective: a link from someone they have spoken to. The same questions, the same pillow silhouette, the same cover and case choices as any other shopper — and at the end, instead of a card form, *"Send to our build team."* Then a page that says their pillow is being built, an invitation to make an account so they can check back, and an email a day or two later carrying the finished build and its price. They pay then, or they do not.

From a developer perspective this is mostly the removal of three guards. The customer journey page, the sign-in prompt, the assigned-build email, the Stripe Checkout, the webhook that settles a payment the customer walked away from, the Order writer, the money ledger, the inventory deduction and the fulfilment flow are all built and all exercised by the existing path. One new column, one new branch in an existing route, no new API route, no new Stripe concept, no webhook change.

The single idea holding it together: **a Result with no Authorization hold is payable, settling through the same immediate-capture Checkout that a top-up already uses.** A full payment is a top-up from a hold of zero. Keying the rule on the absence of a hold rather than on the new **Source** value keeps it to one change in the shared lifecycle — and drains the in-store `measurement_residue` backlog with the same code, which is the walk-in version of the same journey.

What ships:

1. Glossary entries for **Assist link**, **Assisted customisation** and **Balance payment**, the new **Source** value, and ADR 0016.
2. A reusable per-**Staff** **Assist link**, generated lazily and copied from the **Admin Panel**.
3. A no-card submit on the preview, and the **Result** it produces reading as real work rather than as stuck.
4. A waiting state and a submit-confirmation email for the customer, reusing the sign-in card that already exists.
5. The assigned email freed from its hold requirement, and a "Request payment" action beside Save assignment.
6. Deferred settlement: the three guards, and **Pay SGD X** where the dead-end paragraph is today.
7. Reminders for a build nobody has paid for.
8. A human pass through the whole thing against real Stripe.

## User Stories

### The link

1. As **Staff**, I want a customisation link I can copy once and reuse with every customer, so that I do not have to generate a new one per conversation.
2. As **Staff**, I want that link to be unguessable and tied to me, so that it can be revoked without affecting anyone else and so I can tell which submissions came from my outreach.
3. As **Staff**, I want the link presented with a QR code, so that I can show it on screen to someone standing in front of me.
4. As **Staff**, I want a **Result** that arrived through my link badged as such in the queue, so that I can tell it apart from a shopper who found us alone.

### The customer's journey

5. As a customer given the link, I want the same configurator everyone else sees, so that nothing about it feels like a side door.
6. As a customer given the link, I want to finish without entering card details, so that I am not paying for a pillow nobody has designed yet.
7. As a customer, I want to be told plainly what happens next, so that silence does not read as a failed submission.
8. As a customer, I want an email confirming my measurements arrived, so that I have a way back to the page.
9. As a new customer, I want to create an account from that page, so that I can check progress without keeping the link.
10. As a returning customer, I want to sign in and see the build, so that I do not depend on an email I may have deleted.
11. As a customer, I want to see the finished build and its full price before paying, so that I am agreeing to something specific.
12. As a customer, I want to decline, so that saying no does not require ignoring emails.

### Staff completing the build

13. As **Staff**, I want to compose the build in the editor I already use, so that an assisted **Result** is not a second workflow to learn.
14. As **Staff**, I want Save assignment to notify the customer that the build is ready and priced, exactly as it does for a shopper who left a hold.
15. As **Staff**, I want the price computed from **Costings**, so that two members of staff quoting the same build quote the same number.
16. As **Staff**, I want to copy the customer's payment link from the **Result**, so that I can send it over WhatsApp when email is not how we are talking.

### The money

17. As a customer, I want to pay the full amount in one step, so that there is no separate deposit to reconcile.
18. As **Staff**, I want a paid assisted **Result** to become an **Order** identical to any other, so that production and fulfilment need not know how it was sold.
19. As **Staff**, I want the payment to land in the money ledger and reconcile against the order total, so that Analytics and refunds behave.
20. As a customer, I want a payment I completed to count even if I closed the tab before returning, so that I am neither charged twice nor left with nothing.
21. As **Staff**, I want inventory deducted once, on successful payment, so that stock is not consumed by a build nobody bought.

### Ops

22. As **Staff**, I want an assisted submission awaiting assignment to appear as work, not as an error, so that the queue stays trustworthy.
23. As **Staff**, I want to be nudged about an assisted **Result** I have not assigned, so that a customer is not left waiting on my inbox habits.
24. As a customer, I want a reminder about a build I have not paid for, so that a forgotten email does not quietly end it.
25. As **Staff**, I want to cancel an assisted **Result** that is going nowhere, so that the queue is closed by a decision rather than a timeout.

## Implementation Decisions

**The rule is "no hold means settle by Balance payment", not "this Source is special".** Every alternative considered threaded `source === 'staff_assisted'` through the lifecycle, the accept route, the stage machine and the cron — four places that would each have to agree, and each a place a future **Source** value could be forgotten. Keying on `payment_intent_id == null` is one condition in the shared lifecycle. It also makes the existing in-store measurement-only **Result** payable, which is not a side effect to be tolerated but the walk-in version of the same feature: **Staff** measure someone at the counter, build the pillow that week, and send them a link. Rejected: a `payment_mode` column, because a nullable `payment_intent_id` already carries exactly that information, and a second source of truth for it could disagree with the first.

**The Balance payment reuses the top-up Checkout verbatim.** `createTopUpCheckout` is already an immediate-capture Stripe Checkout Session tagged `purpose: "result_topup"`, and the webhook branch that settles it (`app/api/stripe/webhook/route.ts:95`) already handles the hard case — a customer who paid and never came back — by stamping `topup_payment_intent_id` and `topup_paid_at` so a later `accept` settles from that intent rather than charging again. A full payment is that mechanism with the hold at zero. Rejected: `POST /api/stripe/payment-link`, which mints a durable Stripe Payment Link against the first active variant of a *catalog product*, carries no `result_id`, and is ignored by the webhook — it cannot express a per-customer build. Also rejected: a new route with a new `purpose` value, which would need a parallel webhook branch and a second settlement path to keep correct forever. The `topup_*` columns keep their names; **Balance payment** is the domain term covering both meanings, and the column comment says so.

**`accept`'s payment-intent guard is dropped; `capture`'s is kept and becomes load-bearing.** These two guards look symmetrical and are not. `accept` is reachable only from `assigned`, which already requires **Staff** assignment and a confirmed **Filling Template**, so the payment-intent check there guards nothing assignment has not already guarded — and in the deferred flow `accept` is precisely the step that *creates* the Checkout, so it must run before any money exists. `capture` is the transition that must never happen without money, and it becomes the sole guard: a captured hold, or a paid **Balance payment**. Weakening it is the one change in this initiative that could produce an unpaid **Order**.

**The submit is a branch in `/api/results/hold`, not a new route.** That route is 684 lines and almost none of it is Stripe. It validates the phone and **Discovery source**, loads the **Composed sellable** from **Costings** and refuses an unpriced one, validates item categories, computes shipping and tax through `priceResult()`, rotates the **Result access token**, links a signed-in **Customer**, resolves **Referral** attribution, computes and persists the **Recommendation record**, enforces that a **Flow route** is resolved before payment, applies the sticky **Pre-order** flag, and writes the **Filling configuration** snapshot. A second route would either duplicate all of that or drift from it. The deferred branch skips `createHoldCheckout`, writes `authorized_amount: null`, and returns the status-page URL instead of a checkout URL.

**The deferred branch is authorised by the row, not by the request.** A request cannot ask to skip payment. The branch is honoured only when the existing `mp_config_responses` row already carries `source = 'staff_assisted'`, written server-side when the configurator resolved a real **Assist link** code. This is a trust boundary: without it any caller could mint a no-hold **Result** and put a free build into the queue. The exposure is not new — *"Save without purchasing"* is already open to guests — but this slice must not widen it, and it removes that button in assisted mode so it cannot overwrite **Source** with `"manual"` through `buildInstoreReviewOnlyPatch`.

**The Assist link is a reusable per-Staff code, resolved server-side.** It copies `/mp-config?partner=<code>` exactly: the code is looked up against the table, and the id it resolves to is never accepted from the client. `ensureReferralCode()` (`lib/referrals/index.ts:74`) is the generate-lazily-and-retry-on-collision pattern, and `0045_result_customer_access.sql` is the nullable-column-plus-partial-unique-index pattern. Rejected: a single-use pre-minted session link, which needs a mint endpoint and leaves an empty **Draft Result** row per click; its one advantage — binding a link to a named customer — is not worth a second link lifecycle when **Staff** can already see who submitted.

**Staff finish the build where they already finish builds.** The **Result** detail assign card mounts `XrayEditor` and offers size×**tier**, the **Filling Template** selector, the engine recommendation with `plainLanguageWhy`, the derived pack list and the final amount. Save assignment is mark-ready. `lib/spatial-fillings/surface-parity.check.ts` hardcodes the three legal editing surfaces and fails CI if a fourth appears, so building a separate "assisted build" screen would break the build by design. Rejected: reopening the configurator in **Staff assist mode** on a submitted session, which needs the `draftOnly` guard in `requireResultAccess` relaxed for non-draft rows and reverses a recorded decision (*"Post-hold edits stay in Admin Panel — no Result-reopen assist in v1"*).

**The amount is `priceResult()` and nothing else.** **Costings** **MSRP** for the assigned **Composed sellable**, plus **Customer preference** and **Add-on** MSRPs, plus shipping and tax — the same function the hold and the accept path already use. `PRD-money-flow-traceability` requires the Stripe charge to reconcile against the DB order total, and a staff-typed figure cannot be reconciled against anything. Rejected for v1: a discount field, which needs a permission, an audit entry and ledger work; `/settings/discounts` exists if that becomes a real requirement.

**Nothing expires.** The SLA cron exists because a Stripe authorization dies at seven days; a deferred **Result** has no such clock. Expiring one would throw away a build **Staff** spent time composing, for no external reason. The cron instead gains two reminder paths — an operator nudge on assisted `held` rows it currently skips entirely, and a customer reminder on `assigned` rows awaiting a **Balance payment**, which it does not scan at all. Closing an assisted **Result** stays a human decision, and `cancel` already accepts both `held` and `assigned` and already no-ops the hold release when there is no hold.

**An assisted Order ships; it is not born delivered.** `accept/route.ts:226` treats `source === "manual" || shipping_address == null` as in-store handover and stamps `delivered_at` at capture, because at the counter capture *is* delivery. An **Assisted customisation** has neither property — its **Source** is `staff_assisted` and the submit requires a shipping address — so it is born `confirmed` and passes through normal fulfilment. This needs no code change, which is exactly why it must be asserted: `delivered_at` anchors the RMA **Return window** and partner **Commission** release.

## Testing Decisions

A good test here asserts external behaviour: what a route returns, what the lifecycle permits, what the queue shows a human — not how a function is spelled.

**Tested: the lifecycle with and without a hold.** `lib/result-lifecycle/__tests__/` already covers the pure transition table. Extend it — `accept` from `assigned` with no `payment_intent_id` succeeds; `capture` refuses when there is neither a hold nor a paid **Balance payment**; `capture` succeeds on a no-hold **Result** once the balance is paid; `capture` on a captured hold is unchanged. This is the one file where a wrong answer produces an unpaid **Order**, so it carries the strongest cases.

**Tested: `planCapture` at a zero hold.** `lib/authorization-hold/__tests__/` — `planCapture(final, 0)` returns `{ kind: "top_up", holdCapture: 0, topUp: final }`, and every existing positive-hold case still holds.

**Tested: the deferred submit is refused for a row that is not assisted.** `app/api/results/hold/__tests__/` — a `deferred: true` request against a row whose **Source** is unset or `"online_purchase"` is refused, and the refusal short-circuits before any Stripe call. Prior art for the harness: `app/api/mp-config/__tests__/ownership-gate.test.ts`, whose `vi.hoisted()` mock handles, chainable Supabase stub and `await import()` of the route after the mocks let it assert `expect(h.loadDetail).not.toHaveBeenCalled()` — the same shape proves no Stripe object was created.

**Tested: an assisted submission reads as work, not as stuck.** `lib/results/__tests__/result-stage.test.ts` — a `held` row with `source: 'staff_assisted'` and a null `payment_intent_id` is `needs_assign`; an `online_purchase` row in the same shape is still `abandoned_checkout`; a `manual` row is still `measurement_residue`.

**Tested: the accept route settles a no-hold Result without calling capture.** `app/api/results/[id]/accept/__tests__/` — a no-hold `assigned` **Result** returns a checkout URL rather than 400; given a paid balance session it creates the **Order**, writes exactly one `charge` ledger row for the balance intent and none for the zero hold, sets `payment_reference` to the balance intent, and never calls `captureHold`.

**Tested by self-check: the assisted preview offers exactly one primary call to action, and it is not a card.** A new `lib/configurator/assisted-cta.check.ts` reading the configurator source, in the style of `lib/configurator/staff-assist.check.ts` and `lib/spatial-fillings/surface-parity.check.ts`. The risk it guards is a later edit reintroducing the hold CTA, or leaving *"Save without purchasing"* mounted in assisted mode where it would silently rewrite **Source** to `"manual"` and drop the **Result** back into `measurement_residue`.

**Tested by the existing suite, which must not be allowed to pass trivially:** `lib/email/__tests__/registry-coverage.test.ts` already fails the build for an unregistered template, so the pay-now variant must be registered with a fixture in `lib/email/__fixtures__/samples.ts`. `lib/auth/__tests__/settings-routes-guarded.test.ts` and `app/api/mp-config/__tests__/routes-guarded.test.ts` already walk the route folders per verb; a new gated route folder extends one of them.

**Not tested automatically:** the Stripe Checkout redirect round trip and its cancel branch; the webhook actually firing; whether the emails render in a real mail client; the QR code scanning off a screen; and that an assisted **Order** genuinely lands `confirmed` rather than `delivered` in a live database. All of these are slice 08, recorded in `OPS-SIGNOFF.md`.

## Out of Scope

- **Basic Mpillow and Mbolster.** Premium is where assisted selling happens and where the **Filling configuration** work justifies **Staff** time. The lifecycle and money changes are product-agnostic, so extending later is a CTA and a copy change, not a rework.
- **A deposit or instalments.** One payment, in full, at the end. Partial payment means a second settlement state and a reconciliation story the money ledger does not have; nobody has asked for it.
- **A Staff discount on the quoted price.** Considered and explicitly rejected during drafting: it needs a permission, an audit-log entry and reconciliation work, and ADR 0001 plus `PRD-money-flow-traceability` both require the charge to derive from **MSRP**. `/settings/discounts` is the escape hatch if it becomes real.
- **Reopening the configurator in Staff assist mode on a submitted session.** It reverses a recorded v1 decision and needs the `draftOnly` ownership guard relaxed for non-draft rows. The **Result** detail assign card already has the same editor, so the gain would be navigational only.
- **WhatsApp delivery of the payment link.** The infrastructure exists (`lib/appointments/whatsapp.ts`), but a message carrying a URL button outside the 24-hour service window needs a Meta-approved template, which is an ops lead time rather than a build. **Staff** can copy the link (story 16) meanwhile.
- **Commission on assisted sales.** An **Assist link** is a **Staff** link, not a **Referral**; `partner_id` stays null and the **Commission** ledger is untouched. A partner doing the same thing already has **Partner-assisted customisation**.
- **Reserving stock at submission.** Consistent with ADR 0002: inventory is validated at assign and at accept, and deducted only on successful payment. A deferred **Result** waits longer, which makes reserving more tempting and no less wrong.
- **Auto-expiry of unpaid assisted Results.** See the decision above — there is no external clock, and the build represents real **Staff** effort.

## Further Notes

### Coordination with Staff assist mode (slice 14, now on `main`)

**Staff assist mode** was rebuilt underneath this PRD while it was being drafted — commit `f95cdc8a`, landed on `main` 2026-09-11, superseding slice 04 of `PRD-staff-assist-spatial-fillings`. Full handoff in that PRD's `issues/14-staff-toolbox-template-save.md`. Three of its changes bear on this initiative, and one non-change matters more than any of them.

**The non-change first, because it is what prevents duplicated work: this initiative adds nothing to the assist tool rail.** Decision (a) puts build completion on the **Result** detail assign card, not in the configurator, so no `ToolSpec` entry is added, neither `staff-assist-panel.tsx` nor `staff-assist-bolster-panel.tsx` is touched, and the pillow/bolster parity obligation that `lib/spatial-fillings/surface-parity.check.ts` enforces ("change both or neither") does not arise. The only configurator file this initiative edits is the preview call to action in `mp-config-client.tsx`, which slice 14 touched by a single line, nowhere near it. If a later reader feels the urge to add a "request payment" control to the rail, that is the duplication this paragraph exists to prevent — the payment affordance belongs beside Save assignment in the **Admin Panel**.

**The panel is a data-driven rail now.** `components/configurator/staff-toolbox.tsx` takes `tools: ToolSpec[]`; a control is one array entry, not a form row. `layout: "segmented"` wraps short options into pills, `"list"` stacks long names with checkmarks, `readOnly: true` renders a derived value as a static chip. `action` is the trailing slot (currently Save) and `children` is what the panel owns outside the rail (currently the size×**tier** confirm gate). Recorded here so that the next person to need a control reaches for the array rather than reintroducing markup.

**Permissions are layered, and this PRD depends on the first row of that table.** Entering assist mode — the page and both GET endpoints — requires `results`; saving to the **Filling Template** catalog requires `inventory`. `viewer` is excluded from assist entirely. So the configurator's gate is now `Boolean(staffCtx && roleHasPermission(staffCtx.role, "results"))`, not `Boolean(staffCtx)`. An **Assist link** is orthogonal to all of it: the customer holding the link has no `admin_users` row at all, so `getAdminContext()` is null and they were never in scope for assist. The two must not be collapsed into one prop. Slice 14 carries a load-bearing gotcha of its own — the Save control renders on "mix is dirty" alone, which is safe only while every role holding `results` also holds `inventory`, and a check asserts exactly that; if it fails, grant the permission or hide the control, never delete the assertion.

**Staff may now save an edited mix back to the catalog** via `POST /api/mp-config/assist` with `mode: "overwrite" | "new"` — placements only, `bom_template_lines` untouched as the pack-list fallback (ADR 0008). Slice 04's old rule forbidding a save control is superseded and must not be "restored". This initiative does not call that endpoint, but its existence means an assisted session's mix may already be a catalog template by the time **Staff** open the **Result**.

**The one contract this initiative must not break.** `sessionTemplateId(loaded, session)` returns the loaded template id *only* while the placements still match it exactly; any diverging edit clears it. That single value drives both the toolbox status pill and the `templateId` claim in the hold snapshot in `mp-config-client.tsx` — and the deferred submit in slice 03 goes through the same `/api/results/hold` route and carries the same `assistFilling: { placements, templateId }` payload. The deferred branch must pass it through unchanged and must not introduce a second "is dirty" flag to decide the claim. Related: `saveAffordance({ placements, loaded })` decides what may be saved (unedited → nothing, scratch-built → new only, empty stage → nothing, so clearing the x-ray cannot blank a catalog template), and `assistPlacements` lives in the top-level client so the mix survives step navigation — the panels receive it as a prop and edits happen on the x-ray, deliberately with no list editor in the panel.

**Run `npx tsx lib/configurator/staff-assist.check.ts` before and after any work in these files.** It is where all three of slice 14's decisions are asserted as intent rather than drift.

**Not this initiative's to QA, and not to be claimed by it:** slice 14's catalog save path has never executed against a real database. It mirrors the **Admin Panel**'s `PUT` exactly, but an overwrite and a save-new both need a live pass before anyone trusts it. That belongs to slice 14's sign-off, not to slice 08 here, even though both want a real database on the same afternoon.

### Other notes

The `source` column is free text with no check constraint (`0030_mp_config_order_link.sql:9`), so `staff_assisted` needs no migration of its own — only the badge label and the branch in `resultStage()`. The single migration in this initiative is `admin_users.assist_code`.

`shouldCreateInstoreReviewOnly()` returns false only for `source === "online_purchase"`, so an assisted row would pass through it and be rewritten to `"manual"` if *"Save without purchasing"* stayed mounted. Slice 03 removes the button in assisted mode rather than adding a fourth condition to that predicate, but if the button is ever restored, the predicate is where the guard belongs.

Two bundle facts worth knowing before touching these surfaces: the settings bundle budget is 480 KB gzip because `configure/[card]` and `results/[id]` both mount `XrayEditor` and sit at ~477 KB, and `pnpm bundle:check` is part of `npm run ci`. The **Result** detail additions in slice 05 are a button and a copy affordance, which should be free, but the margin is thin.

The knowledge graph at `graphify-out/` must be refreshed in the same commit as any code change — `.github/workflows/graphify-freshness.yml` rebuilds it on every pull request and fails if the committed graph does not match the source.
