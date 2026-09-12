# Assisted customisation 05: Save assignment notifies a customer who left no card, and Staff can copy the payment link

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: 13–16

## What to build

Almost nothing, because the hard part shipped in PR #117 and nobody noticed it solved this.

**Mark-ready already exists and is called Save assignment.** The **Result** detail assign card mounts `XrayEditor` — the same editor as the configurator, since the three surfaces were unified — alongside size×**tier**, the **Filling Template** selector, the engine recommendation rendered through `plainLanguageWhy`, the derived pack list and the final amount. Pressing Save assignment transitions `held → assigned`, writes the **Filling configuration** snapshot as **Placement** rows, computes `final_amount` through `priceResult()` and emails the customer. There is no `build_ready` column to add and no second build state to invent; adding one would fork the truth that `resultStage()` already derives.

**The gate to lift.** `app/api/results/[id]/assign/route.ts:477` reads `if (hasHold && row.customer_email && row.access_token)` before sending the assigned email. The `hasHold` term is there because, until now, a **Result** with no hold could never be accepted, so telling its customer the build was ready would have been a cruelty — a price they could look at and not pay. Once slice 06 lands they can pay, and the term is wrong. Drop it; keep the email and token conditions, which are about being able to address the customer at all.

**The email needs a second voice.** `renderResultAssignedEmail` currently tells a shopper their authorized card will be charged on Accept. A customer who left no card must be told the total and asked to pay. Same renderer, a variant: the pricing breakdown is identical, the call to action goes to the same tokenised status page via `statusUrl()`, and the raw URL is never printed in the body. Register the variant with a fixture in `lib/email/__fixtures__/samples.ts` or `registry-coverage.test.ts` fails the build — which is the intended behaviour of that test, not an obstacle.

**"Request payment" beside Save assignment.** Two jobs, both small. It re-sends the priced email for a customer who lost it, and it exposes the customer's tokenised status URL as a copyable string so **Staff** can paste it into WhatsApp, where a lot of these conversations actually live. The copy affordance is the same few inline lines used in four places already — `referral-share-card.tsx` is the fullest version — and the URL is built by `statusUrl()`, never hand-assembled, so the token handling stays in one place. It is idempotent: pressing it twice re-sends an email and does not change the **Result**.

**Where this must not go.** Not the configurator, and specifically not the assist tool rail — that is a live pre-submit session, and this is a **Result** that has already been submitted. `lib/spatial-fillings/surface-parity.check.ts` will fail the build if a fourth editing surface appears, which is the guard working as designed.

Demoable outcome: **Staff** open an assisted **Result**, compose the filling mix in the x-ray, press Save assignment, and the customer receives an email showing the finished build and its full price with a button to pay — and **Staff** can copy that same link to send by hand.

## Acceptance criteria

- [ ] Save assignment on a **Result** with no hold sends the assigned email; the `hasHold` term is gone and the email and token conditions remain.
- [ ] The no-hold variant states the total and asks for payment, and does not mention an authorization or a card already held.
- [ ] The with-hold variant is unchanged, word for word.
- [ ] Both variants are registered with fixtures and `registry-coverage.test.ts` passes.
- [ ] `final_amount` is written by `priceResult()` and there is no way for **Staff** to type or override an amount.
- [ ] "Request payment" re-sends the priced email and copies the tokenised status URL, built by `statusUrl()`.
- [ ] Pressing "Request payment" twice re-sends the email and leaves the **Result** unchanged.
- [ ] No new editing surface is introduced; `npx tsx lib/spatial-fillings/surface-parity.check.ts` passes.
- [ ] The **Result** detail route stays within the 480 KB gzip settings bundle budget and `pnpm bundle:check` passes.
- [ ] `npm run ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 03 (there is no assisted **Result** to assign until one can be submitted)
- Ships before 06 but must not be deployed alone: until 06 lands, the email invites a customer to a page that cannot take their money. Deploy 05 and 06 together.
