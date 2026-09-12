# Assisted customisation 08 (HITL): Sign-off — one real link, one real card, one real order

Type: HITL
Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: every story end to end

## What to build

Nothing. This is the human pass that turns "the tests pass" into "a customer can buy a pillow this way".

It exists because every automated test in this initiative asserts a guard in isolation, and none of them can observe the three things most likely to break: a Stripe redirect round trip, a webhook arriving, and an email as a real mail client renders it. It also exists because slice 06 changes the code path that charges cards, and the cost of being wrong is an **Order** with no money behind it or a customer charged twice.

**The pass**, once, on a real handset, in Stripe test mode, with a real inbox:

**The link** — a **Staff** member copies their **Assist link** from the **Admin Panel**, scans the QR from the screen with a phone, and lands on `/mp-config`. Confirm the phone sees no assist chrome, no x-ray editor and no tool rail.

**The submit** — answer every measurement question, pick a cover and a case, add an **Add-on**, enter contact details, a **Discovery source**, an address and a shipping method. Confirm the primary control says *"Send to our build team"*, that no card is requested, and that *"Save without purchasing"* is absent. Submit.

**The wait** — confirm the landing page says the pillow is being built and offers sign-up. Confirm the confirmation email arrives, mentions no charge, and its button opens the status page. Create an account from that page and confirm the **Result** appears in the account list.

**The build** — in the **Admin Panel**, confirm the **Result** is in **Needs assign**, not **Stuck**, and badged as assisted. Assign a size×**tier**, compose a filling mix in the x-ray, and Save assignment. Confirm the priced email arrives with the full total and a pay button, and that "Request payment" copies a link that opens the same page.

**The money, including the branch most likely to break** — press Pay. At Stripe Checkout, **cancel** rather than pay, and confirm the return lands on the status page with the build still payable and nothing charged. Press Pay again and complete it. Confirm the status page reaches "In production".

**The tab-closed branch** — worth a second **Result**, because it is the one the webhook exists for: complete Checkout and close the tab at the Stripe confirmation, before the redirect. Reopen the status page from the email and confirm the **Result** settles into an **Order** from the stored intent, with exactly one charge.

**The order** — in the **Admin Panel**, confirm the **Order** exists with the customisation snapshot carrying the filling placements, that its status is `confirmed` and `delivered_at` is null, that `amount_captured` matches what Stripe took, that `order_payments` holds exactly one charge row, and that inventory was deducted once. Then mark it shipped with a tracking number and mark it delivered.

**The refusals** — from a second browser holding nothing but the **Result** id: the status read, accept and decline must all refuse. And confirm a `deferred` submit against a **Result** that is not assisted is refused.

**Recording.** Results go in `../OPS-SIGNOFF.md` in the house shape: parent link, date, signer, environment and surface, a checklist table of criterion / status / evidence, then "Found during sign-off" and "Residual".

**Not in this pass.** Slice 14 of `PRD-staff-assist-spatial-fillings` has its own untested path — saving an edited mix back to the **Filling Template** catalog, which has never run against a real database and needs both an overwrite and a save-new exercised. It wants a live database on the same afternoon as this slice and is easy to sweep in, but it belongs to that slice's sign-off. Do not record it here, and do not skip it there on the grounds that "the assisted pass touched assist mode".

Demoable outcome: a signed and dated `OPS-SIGNOFF.md` showing one pillow sold end to end through an **Assist link**, and a second **Result** proving the closed-tab branch settles.

## Acceptance criteria

- [ ] The QR code scans off a screen and opens the configurator on a phone.
- [ ] A link-holding customer sees no assist chrome and no x-ray editor.
- [ ] The submit completes with no card and no *"Save without purchasing"* control.
- [ ] The confirmation email arrives, renders correctly in a real client, mentions no charge, and links to the status page.
- [ ] Account creation from the status page works and the **Result** appears in the account list.
- [ ] The **Result** shows as **Needs assign**, badged assisted, not **Stuck**.
- [ ] The priced email arrives after Save assignment with the correct total.
- [ ] Cancelling at Stripe Checkout returns to a still-payable build with nothing charged.
- [ ] Completing Checkout produces an **Order** and a status page reading "In production".
- [ ] A second **Result** paid with the tab closed before redirect settles into an **Order** with exactly one charge and no double charge.
- [ ] The **Order** is `confirmed` with a null `delivered_at`, carries the filling snapshot, and its ledger reconciles.
- [ ] Inventory is deducted exactly once.
- [ ] Marking shipped and delivered works, and `delivered_at` is stamped at delivery, not at payment.
- [ ] A second browser holding only the **Result** id is refused on read, accept and decline.
- [ ] A `deferred` submit against a non-assisted **Result** is refused.
- [ ] Results are recorded in `../OPS-SIGNOFF.md`.

## Blocked by

- 07 (everything else must be live)
