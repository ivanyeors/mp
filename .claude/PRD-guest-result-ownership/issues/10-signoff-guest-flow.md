# Slice 10 (HITL) — Sign-off: the whole guest journey, both locales, second-browser refusal

Type: HITL
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 34, 35

## What to build

Nothing. This slice is the human pass that turns "no customer was broken" from an assumption into
an observation, and demonstrates the fix rather than merely deploying it.

It exists because enforcement ships with no feature flag. Every automated test in this PRD asserts
a guard in isolation; none of them can tell you that a real person moving through a real Stripe
Checkout, a real email and a real browser never meets a 403.

**The pass.** In a real browser, once per locale, with developer tools open and the network tab
recording:

**Guest journey** — fresh session on `/mp-config`; type measurements and watch autosave succeed;
load the recommendation; upload a front and a side photo; use "save without purchasing" with
contact details; then start again and place a real **Authorization hold**.

**The cancel branch, which is the one most likely to break** — at Stripe Checkout, cancel rather
than pay. Return to `/mp-config`. The session id must rotate and autosave must succeed. If the save
indicator sticks on "error", slice 05 is not live or not working, and slice 06 must be rolled back
until it is.

**Post-hold** — receive the held email; have **Staff** assign the build in the **Admin Panel**;
receive the assign email; open the status page from its link; accept or decline.

**Both variants** — repeat the first two steps on `/mp-basic` in the same browser and confirm the
two sessions do not interfere.

**Staff surfaces** — **Admin Panel** **Result** detail renders in full; "measured by", **Location**
and send-to-Telegram still work on a `held` row; the Telegram message arrives with photos attached;
the order detail still lists linked **Results**.

**The refusal demonstration** — from a second browser with no session, holding nothing but a
**Result** id copied from the first: the measurement read, the measurement write, the photo write
and the order-linked-**Result** read must all refuse. Record the status codes.

**The row-level-security demonstration** — with the publishable key taken from the deployed browser
bundle, attempt to select and to delete from the body-photo table. Both must be refused. This is
the one check that no route test can make.

**Recording.** Results go in `../OPS-SIGNOFF.md`, in the house shape: parent link, date, signer,
environment and surface, a checklist table of criterion / status / evidence, then "Found during
sign-off" and "Residual".

Demoable outcome: a signed and dated `OPS-SIGNOFF.md` showing the guest journey completing in both
locales and the second browser refused at every endpoint.

## Acceptance criteria

- [ ] The full guest journey completes with no 403 and no stuck save indicator, in both locales.
- [ ] The Stripe cancel-and-return branch rotates the session id and resumes autosaving.
- [ ] Photo upload succeeds during the journey and the photo reaches the Telegram message.
- [ ] `/mp-config` and `/mp-basic` sessions coexist in one browser without interfering.
- [ ] The held email and the assign email arrive and their status-page links work.
- [ ] **Admin Panel** **Result** detail, "measured by", **Location**, send-to-Telegram and the
      order detail's linked-**Results** list all behave as before.
- [ ] A second browser holding only a **Result** id is refused on the measurement read, the
      measurement write, the photo write and the order-linked-**Result** read; the status codes are
      recorded.
- [ ] With the publishable key from the deployed bundle, `select` and `delete` against
      `mp_config_response_photos` are both refused.
- [ ] `../OPS-SIGNOFF.md` records date, signer, environment, a checklist table with evidence, and a
      Residual section.
- [ ] Anything found during the pass is either fixed or written into Residual with an owner.

## Blocked by

- Slices 02–09 (all of them; this is the closing pass)
