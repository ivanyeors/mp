# 07 — Expiry after 24 months without a purchase, with reminders at 3, 2 and 1 months

**Issue:** not filed
**Type:** AFK
**Status:** not started
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

- [ ] **Expiry, SQL assert.**
      - A balance expires the day after `expires_on`, once.
      - A purchase the day before moves `expires_on` 24 months on.
      - A Claim bonus alone starts a clock.
- [ ] **Reminders, vitest table.**
      - The 3-, 2- and 1-month emails go once each per clock.
      - A purchase starts a new clock with its own three.
      - Only the latest due reminder goes after a missed day.
      - None goes below `points_min_redeem`, or to a Customer who is `not_subscribed` or
        `unsubscribed`.
- [ ] **Unsubscribe.** A customer who unsubscribes between two reminders gets no further one.
- [ ] `./scripts/graphify update .` is run in the same commit.
