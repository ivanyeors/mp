# Assisted customisation 07: Reminders for a build nobody has paid for

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: 23–25

## What to build

Two blind spots in the SLA cron, both of which this initiative creates traffic for.

**The cron skips exactly the rows this PRD produces.** `app/api/cron/results-sla/route.ts:111` reads `if (!row.payment_intent_id) continue;` — correct when the only no-hold **Results** were in-store measurements with nothing to chase, and wrong the moment a remote customer is waiting on **Staff**. And the query selects `status = 'held'` only, so an `assigned` **Result** awaiting a **Balance payment** is not scanned at all. An assisted submission can therefore sit unassigned forever, and a priced build can sit unpaid forever, with nobody told in either case.

**Two reminder paths, no new expiry.** On an assisted `held` row, nudge the operator — the same shape as the existing held-**Result** reminder (`renderHeldResultReminderEmail` in `lib/email/ops.ts`, sent to `results_sla_ops_email`). On an `assigned` row with no hold, remind the customer that their build is ready and unpaid, reusing the priced-email copy from slice 05 and the tokenised link from `statusUrl()`.

**Nothing expires, and this is the decision to preserve.** The SLA machinery exists because a Stripe authorization dies at seven days. A deferred **Result** has no such clock, so expiring one would throw away a build **Staff** spent real time composing for no external reason. `transitionResult`'s `expire` stays reachable only from `held` *with* a hold. Closing an assisted **Result** stays a human act: `cancel` already accepts both `held` and `assigned`, and already no-ops the hold release when `payment_intent_id` is null, so **Staff** cancel needs no change — only confirmation that it behaves on a no-hold row.

**Cadence and idempotency.** Reuse `planHeldTick` and `last_reminder_at` rather than inventing a second schedule; a reminder must not re-send on every cron pass, and the existing column already carries that state. Terminal and paid rows are skipped.

Demoable outcome: an assisted **Result** left unassigned past the reminder window produces an operator nudge; a priced one left unpaid produces a customer reminder; neither is ever auto-expired; and running the cron twice in a row sends nothing the second time.

## Acceptance criteria

- [ ] The cron scans assisted `held` rows with no `payment_intent_id` and nudges the operator.
- [ ] The cron scans `assigned` rows with no hold and reminds the customer, with a tokenised link from `statusUrl()`.
- [ ] No no-hold **Result** is ever auto-expired, and `expire` remains reachable only from `held` with a hold.
- [ ] In-store `manual` measurement rows keep their current treatment and produce no customer reminder.
- [ ] Reminders are idempotent across consecutive runs, driven by `last_reminder_at` and `planHeldTick`.
- [ ] Terminal statuses and rows with a linked **Order** are skipped.
- [ ] **Staff** cancel works on a no-hold **Result** from both `held` and `assigned`, attempts no hold release, and records the snapshot.
- [ ] `npm run ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 06 (a payment reminder is only honest once the payment can be made)
