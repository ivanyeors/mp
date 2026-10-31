# 07 — Expiry after 24 months without a purchase, with reminders at 3, 2 and 1 months

**Issue:** not filed
**Type:** AFK
**Status:** retired (owner, 2026-10-31). Points never expire. Everything this slice built (the
clock, the expiry, the reminders, their emails and the setting) was removed by
`20261031120000_points_never_expire.sql` and the change that came with it; see ADR 0030's
amendment of 2026-10-31. It never ran in production: points were still off.
**Blocked by:** 02, 03
**User stories:** 8
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`

## Goal

A balance expires 24 months after the customer's last purchase (rule o). A customer who agreed to
marketing email is told three times before it does (rule p). A purchase restarts the clock and
stops the reminders.

It is not on the launch path. The first reminder is 21 months after launch, but it ships before
then, because the terms promise it.

## Scope

**The clock.**

- `last_purchase_at` is the latest `paid_at` of the Customer's paid Orders, or the Claim bonus's
  `created_at` if that is later.
- `expires_on = last_purchase_at + points_expiry_months`, as `points_balance` already returns
  (slice 02).
- **The clock's entity** is the Order or Claim bonus entry that set `last_purchase_at`. The
  reminders are keyed on it, so each new clock gets its own three.

**The runner.** `runPointsExpiry` joins the daily job after `runPointsEarn`.

- **Expire.** For each Customer whose `available > 0` and `expires_on ≤ today`, one SQL function
  locks the Customer and writes an `expire` entry for `−available`. A re-run finds a zero
  balance and writes nothing. A `spend` reserved at that moment is already debited, so it is
  unaffected.
- **Remind.** For each Customer with `available ≥ points_min_redeem` and
  `marketing_email = 'subscribed'`, the runner works out which reminder is due:
  `points.expiry_3m`, `points.expiry_2m` or `points.expiry_1m`.
  - It sends only the latest one due, so a missed day never sends two at once.
  - The send goes through `dispatchCustomerEmail` with `entity_id` = the clock's entity. The
    ledger's unique `(customer, template, entity)` makes each one once per clock.
  - The consent check copies the check-up reminder's (`decideCheckupEmail`,
    `lib/aftercare/checkup-server.ts:250-258`), so the two reminders cannot drift apart.
  - Unsubscribing from marketing stops them. There is no separate points switch.
- **The email copy.** "You have 2,130 points (S$21.30). They expire on 12 March 2028 unless you
  make a purchase before then." It links to the shop, the terms and the Profile.
- **Registry and footer.** The three templates go into the email registry in the same group as the
  check-up. They carry whatever the check-up carries in its footer.

## Acceptance criteria

- [x] **Expiry, SQL assert.**
      - A balance expires the day after `expires_on`, once.
      - A purchase the day before moves `expires_on` 24 months on.
      - A Claim bonus alone starts a clock.
- [x] **Reminders, vitest table.**
      - The 3-, 2- and 1-month emails go once each per clock.
      - A purchase starts a new clock with its own three.
      - Only the latest due reminder goes after a missed day.
      - None goes below `points_min_redeem`, or to a Customer who is `not_subscribed` or
        `unsubscribed`.
- [x] **Unsubscribe.** A customer who unsubscribes between two reminders gets no further one.
- [ ] `./scripts/graphify update .` is run in the same commit. Left for the integrator: the slice
      was built in a worktree beside slice 06, and the graph is refreshed once, on the merged code.

## Build notes

Built on `claude/admiring-ride-40h2o6` (`20261021170000_points_expiry.sql`).

- **SQL.** `points_clock()`: the latest paid Order, or the Claim bonus if later, with the entry
  that set it (a tie goes to the Order). `points_balance()` now reads `last_purchase_at` from it
  and `expires_on` from `points_expires_on()`, so the Profile, the expiry and the reminders share
  one clock. `expire_points(customer, now)` takes the per-Customer lock, re-reads the balance
  and the clock under it, and writes one `expire` for the whole available balance, with a note
  ("No purchase for 24 months: the last was on 31 Oct 2024."); a re-run finds 0 and writes
  nothing. `expire_due_points(now)` is the daily sweep. `points_expiry_reminder_candidates(now,
  within_months)` lists every non-partner Customer holding points whose first reminder's day has
  come and whose expiry day has not passed, with the clock and what the email needs. All of them
  do nothing while points are off.
- **The expiry day.** `expires_on` is the last day the points can be used; the balance expires
  on the daily job's first run the day after. The scope's "`expires_on ≤ today`" and the
  criterion's "the day after `expires_on`" disagreed; the criterion won, because the Profile and
  the email both say "expire on 12 March 2028", and a customer who reads that can still use them
  that day. For the same reason no reminder goes on the expiry day itself.
- **Code.** `lib/points/expiry.ts` is pure: which reminder is due (`dueExpiryReminder`, the
  nearest of 3, 2, 1 months whose day has come), the plan (minimum, once per clock, consent) and
  `decidePointsReminderEmail`. `lib/points/expiry-server.ts` has `runPointsExpiry`: expire, then
  plan and send at most 100 a run through `dispatchCustomerEmail`, keyed (Customer,
  `points.expiry_<n>m`, the clock's entity), with Reply-To the support inbox. A failed send is
  retried while it is still the latest due. It never throws, and reports each step.
- **Consent, shared.** The check-up's consent line is now `requireMarketingConsent()` in
  `lib/aftercare/checkup.ts`; `decideCheckupEmail` and `decidePointsReminderEmail` both call it,
  and a test holds the two decisions equal over every combination. If counsel lets the check-up
  go without consent, its one marked line changes and the points reminders keep the gate
  (decision 9).
- **Beyond the spec.** The reminders keep the check-up's other email rules too: the "Emails after
  a purchase" switch, an address, and the allowlist outside production. They carry its footer,
  which says these emails are turned off in the account, so that switch has to stop them.
  Partners are never reminded (they cannot spend). Nothing expires and nobody is reminded while
  points are off. A Customer with no paid Order and no Claim bonus (a Staff adjustment only) has
  no clock, so that balance does not expire.
- **Wiring.** The daily job (results-sla) runs `runPointsExpiry` right after
  `releaseStalePointReservations`, so a reservation the sweep gives back is in the balance it
  expires, and reports `pointsExpiry`: expired, candidates, due, sent per template, failed,
  deferred, skipped by reason, errors.
- **Email.** `lib/email/points.ts`: `POINTS_EXPIRY_EMAIL_COPY`, one set of words for the three
  (`{time_left}` is what differs), editable on Email templates under Aftercare; and
  `renderPointsExpiryEmail`: "You have 2,130 points (S$21.30). They expire on 12 March 2028
  unless you make a purchase before then.", a Shop now button, links to the Profile and the terms
  (`/{locale}/points`), and the check-up's footer (`aftercareFooterHtml`), with no unsubscribe
  link, as transactional mail. Registry: `points.expiry_3m`, `_2m`, `_1m` and a no-first-name
  preview, beside the check-up; fixture `samplePointsExpiry`.
- **Tests.** `assert-07-expiry.sql` (grants; the clock: an Order, a Claim bonus alone, a later
  bonus, a tie, none; the candidates' window both sides and its month ends; points off; the
  dblink race, mutation-checked by removing the lock; the expiry day and the day after, once; a
  purchase the day before; a reserved spend and its later release; a partner's old balance);
  `expiry.test.ts` (the due-day table and month ends; consent parity with the check-up; the
  plan; the daily run day by day: once each per clock with a manual re-run, a purchase's own
  three, only the latest after missed days, a failed send retried, below the minimum,
  `not_subscribed`, `unsubscribed`, unsubscribing between reminders, a balance spent below the
  minimum, the allowlist, and the email's words and links in the customer's locale);
  `points-jobs.test.ts` extended for the chain.
