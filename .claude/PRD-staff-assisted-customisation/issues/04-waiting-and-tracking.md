# Assisted customisation 04: Tell the customer what happens next, and give them a way back

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Built on `feat/staff-assisted-customisation` (2e7fb563), unmerged.**
Criteria verified against the code, its unit tests and the `.check.ts`
self-checks. Anything needing live Stripe, a real inbox or a real database is
marked `[~]` and belongs to slice 08.
User stories covered: 7–10

## What to build

The smallest slice in the initiative, and the one that decides whether a customer believes the submission worked.

**The waiting state.** After submitting, the customer lands on `/results/<id>?token=<t>`, which already renders the journey bar (Submitted → Operator review → Your decision → In production), a status pill and per-status copy from `STATUS_COPY`. For `held` that copy currently reads *"We're reviewing your measurements. You'll be able to accept or decline the final build soon."* — written for someone whose card is already authorized. An assisted customer has paid nothing and needs to be told a different thing: their measurements arrived, **Staff** are building the pillow, and they will be emailed when it is priced. The status page already receives enough of the row to tell the two apart; it needs the copy, not new plumbing.

**The email.** A submit confirmation reusing `renderResultHeldEmail`, with the amount panel — which currently reads *"Authorized amount … Not charged yet"* — replaced by wording that does not imply a card. `statusUrl()` builds the tokenised link and is the only place that should; the raw URL is never printed in the body, matching every other **Result** email. Register the variant and add a fixture, or `registry-coverage.test.ts` fails the build.

**The account.** Nothing to build. `app/[lang]/results/[id]/page.tsx` already renders a `<Card id="sign-in">` with `<LoginForm>` on the guest branch, prefilled with the **Result**'s email, whose copy is *"Save this result to your account so you can check status anytime"* — the existing "create account to track progress" surface, established by `PRD-dock-unified-sign-in` story 39. A signed-in **Customer** already gets the account shell and a list unioned by `customer_id` and `customer_email`, so an assisted **Result** submitted by someone who later signs in with the same address appears without any linking work. This slice's job is to confirm that, not to rebuild it.

Demoable outcome: a customer submits through an **Assist link**, sees a page saying their pillow is being built, receives an email that mentions no charge, closes everything, signs in with that email days later, and finds the build.

## Acceptance criteria

- [x] A `held` **Result** with no hold shows waiting copy that says the build is being made and that an email is coming, and does not mention an authorization, a hold or a charge.
- [x] A `held` **Result** with a hold shows today's copy, unchanged.
- [x] The submit confirmation email renders with no amount-authorized panel and no raw URL in the body, and its call to action opens the tokenised status page.
- [x] The new email variant is registered with a fixture and `registry-coverage.test.ts` passes.
- [x] The guest status page still offers sign-up / sign-in, prefilled with the submitted email, and returns to the same page with its token intact after the round trip.
- [x] A **Customer** signing in with the submitted email sees the assisted **Result** in their list without any manual linking.
- [x] `npm run ci` passes.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 03 (there is nothing to wait for until a submission exists)
