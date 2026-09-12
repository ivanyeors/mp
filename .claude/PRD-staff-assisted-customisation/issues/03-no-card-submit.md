# Assisted customisation 03: Submit without a card, and read as work rather than as stuck

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: 6, 22

## What to build

The customer reaches **Your Custom Mpillow**, fills in contact and shipping exactly as any shopper does, and finishes without a card.

**The swap, and only the swap.** The preview is not redesigned. The left column, the silhouette, the cover and case pickers, the **Add-on** cards, the contact fields, the address and the shipping methods are untouched. One control changes: the primary call to action stops being the hold CTA and becomes *"Send to our build team"*. `holdCtaLabel` already varies its label by **Pre-order**, so this is a third case in an existing function rather than a new branching mechanism.

**The button that has to go.** *"Save without purchasing"* must not render in assisted mode. It is not merely redundant — it POSTs `isFinal: true` to `app/api/mp-config/responses`, which runs `shouldCreateInstoreReviewOnly()`, which returns false only for `source === "online_purchase"`. An assisted row sails through it and is rewritten to `source: "manual"`, which lands it in `measurement_residue` and, later, would make its **Order** be born `delivered`. Removing the control in assisted mode is the fix; adding a fourth condition to that predicate is not, because the predicate is not where the decision belongs.

**The submit.** `/api/results/hold` gains a `deferred` branch. Everything before Stripe runs unchanged — phone and **Discovery source** validation, the **Composed sellable** load from **Costings** with its `pricing_unavailable` refusal, item-category checks, `priceResult()`, **Result access token** rotation, **Customer** linkage, attribution, the **Recommendation record**, the resolved-**Flow route** assertion, the sticky **Pre-order** flag and the **Filling configuration** snapshot. The branch then skips `createHoldCheckout`, writes `authorized_amount: null` and `payment_intent_id: null` with `status: "held"`, and returns the status-page URL where a checkout URL would go. Pricing still runs even though nothing is charged: an unpriced **Composed sellable** must refuse here exactly as it refuses on the hold path, or **Staff** would inherit a submission that cannot be quoted.

**The authorisation, which is the point of the slice.** A request cannot ask to skip payment. The `deferred` branch is honoured only when the row already on disk carries `source = 'staff_assisted'`, written server-side in slice 02 from a resolved code. Any other row — absent, `manual`, `online_purchase` — is refused, and refused before Stripe or any write. This is a trust boundary: without it, any caller could put a free build into the queue.

**The one existing contract this must carry through.** A **Staff** member may open an **Assist link** themselves, in which case the session has both an assisted **Source** and **Staff assist mode**, and the submit carries `assistFilling: { placements, templateId }`. That `templateId` comes from `sessionTemplateId(loaded, session)`, which returns the loaded **Filling Template** id *only* while the placements still match it exactly — any diverging edit clears it. It drives the assist toolbox status pill and the snapshot's template claim from one value. The deferred branch passes it through unchanged: no second "is dirty" flag, no re-derivation, no assumption that an assisted session has no mix. The mix itself lives in `assistPlacements` at the top-level client so it survives step navigation.

**The queue.** `resultStage()` currently reads every no-hold `held` row as stuck, splitting only between `abandoned_checkout` and `measurement_residue`. It gains a third branch so an assisted row reads `needs_assign` — real work, in the bucket **Staff** already work from. The other two branches keep their current answers.

Demoable outcome: a customer opens an **Assist link**, completes the preview with no card, and the submission appears in the **Admin Panel** **Results** queue under **Needs assign** with their measurements, contact details and shipping address on it.

## Acceptance criteria

- [ ] In assisted mode the preview's primary call to action is *"Send to our build team"* and no card is requested.
- [ ] In assisted mode *"Save without purchasing"* does not render.
- [ ] Outside assisted mode both controls are exactly as they are today.
- [ ] `/api/results/hold` with `deferred` creates a **Result** with `status: "held"`, `payment_intent_id: null` and `authorized_amount: null`, and creates no Stripe object.
- [ ] The deferred branch is refused when the stored row's **Source** is not `staff_assisted`, and the refusal happens before any Stripe call or any write.
- [ ] An unpriced **Composed sellable** refuses the deferred submit with the same `pricing_unavailable` response as the hold path.
- [ ] The deferred submit rotates the **Result access token** and returns the status-page URL.
- [ ] A **Staff** assist mix supplied on an assisted session is still snapshotted, and still requires a **Staff** session to be honoured.
- [ ] The deferred submit carries the `templateId` claim from `sessionTemplateId(loaded, session)` unchanged, and no second dirty flag is introduced to decide it.
- [ ] A diverging edit clears the claim on a deferred submit exactly as it does on a hold submit.
- [ ] No `ToolSpec` entry is added to the assist tool rail and neither assist panel is modified, so `lib/spatial-fillings/surface-parity.check.ts` needs no bolster counterpart change.
- [ ] `npx tsx lib/configurator/staff-assist.check.ts` passes before and after the change.
- [ ] `resultStage()` reads an assisted no-hold `held` row as `needs_assign`; `online_purchase` still reads `abandoned_checkout` and `manual` still reads `measurement_residue`.
- [ ] A self-check asserts the assisted preview renders exactly one primary call to action and that it is not the hold CTA, and that *"Save without purchasing"* is not mounted in assisted mode.
- [ ] `npm run ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 02 (nothing can be assisted until a link stamps the **Source**)
