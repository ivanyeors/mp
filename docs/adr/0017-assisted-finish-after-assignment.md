# The finish of an Assisted customisation comes after assignment

An **Assisted customisation** is sent to the build team from the questionnaire. Cover, case, **Add-ons** and shipping are chosen by the customer after **Staff** assign the fillings, on the same finish page, and paid for in the same step. This amends ADR 0016, where the customer finished the preview before submitting.

## Context

In ADR 0016 the customer went questionnaire → finish page (cover, case, add-ons, contact, shipping) → *Send to our build team*. In practice the link is used in person: the customer fills it in on a **Staff** member's signed-in device. Two things went wrong:

- The customer made finish choices before anyone had built the fillings, so the page asked for decisions about a pillow that did not exist yet.
- The signed-in account leaked into the build. The finish page prefilled the **Staff** email, and the hold route linked the **Staff** account as the Result's `customer_id`, so it looked like **Staff** were buying the pillow.

## Decision

**One predicate: `needsCustomerFinish(row) = source = 'staff_assisted' AND shipping_address IS NULL`** (`lib/results/needs-customer-finish.ts`). Every finished Result has an address, because both the hold path and the finish route require one. So a missing address on an assisted row means exactly "customer still to choose". `manual` Results are excluded, since for them a missing address means counter handover.

- The questionnaire CTA becomes *Send to our build team* and collects email, mobile and discovery source. It posts the existing deferred hold with no preference or shipping lines; the schema allows that only when `deferred`. `customer_id` is never set on a deferred submit.
- A **Staff** session redirects to `/settings/results/<id>#assignment`, where the assign card's **X-ray editor** opens pre-filled with the recommended template. Anyone else lands on the status page.
- Save assignment prices goods-only with the default cover and case, and skips the stock check for those two placeholders. The email asks the customer to *choose your finish* rather than pay.
- The status page links to `/mp-config?result=<id>&token=<t>`. The server loads the assigned size and tier, and the Staff snapshot placements are shown read-only through the existing guest x-ray path.
- `POST /api/results/[id]/finish` validates the picks like the hold route does and reprices through `loadAssignedBuild`. It writes the lines, the address and `final_amount`, and the write is conditional on the unfinished state. Payment is the existing accept → **Balance payment** Checkout. There is no new Stripe concept.
- Accept refuses while `needsCustomerFinish`. Otherwise the null address would make the Order be born `delivered`.

## Consequences

- This partially reverses "no Result-reopen in v1": the customer reopens only the finish (cover, case, add-ons, shipping). Fillings stay **Staff**-only, and the finish link carries no assist chrome even on a **Staff** device.
- The price in the assigned email is a floor ("from … before shipping"). The payable total is known only after the finish.
- Results submitted under ADR 0016 already carry an address, so they are unaffected.
- Drafts from before this change that never reached `held` stay Drafts. Staff re-run them through the link.
