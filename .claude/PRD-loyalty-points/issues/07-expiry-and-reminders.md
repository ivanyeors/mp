# 07 — Expiry after 24 months without a purchase, with reminders at 3, 2 and 1 months

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02, 03
**User stories:** 8
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`, `area:account`

## Goal

A balance expires 24 months after the customer's last purchase, and the customer is told three
times before it does (rules n, o). A purchase restarts the clock and stops the reminders.

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
- **Remind.** For each Customer with `available ≥ points_min_redeem` and `points_email` on,
  the runner works out which reminder is due: `points.expiry_3m`, `points.expiry_2m` or
  `points.expiry_1m`.
  - It sends only the latest one due, so a missed day never sends two at once.
  - The send goes through `dispatchCustomerEmail` with `entity_id` = the clock's entity. The
    ledger's unique `(customer, template, entity)` makes each one once per clock.
- **The email copy.** "You have 2,130 points (S$21.30). They expire on 12 March 2028 unless you
  make a purchase before then."
  - It links to the shop, the terms and the Profile switch.
  - It has no products, prices or offers.

**The switch.** `customers.points_email boolean not null default true` follows the aftercare
pattern (`20261020114000_aftercare_preferences.sql`):

- it is a granted column the customer can read;
- `customer_preference_events.preference` is widened to include it;
- one write path writes the column and the event together;
- the Profile has a toggle, Staff have the manual switch, and every reminder links to it.

**Counsel.** By default the reminders are an account notice about the customer's own balance,
with their own opt-out. If counsel reads them as commercial under the Spam Control Act, add
`and marketing_email = 'subscribed'` to the selection. That is one condition, kept in
`lib/points/` with a test.

## Acceptance criteria

- [ ] **Expiry, SQL assert.**
      - A balance expires the day after `expires_on`, once.
      - A purchase the day before moves `expires_on` 24 months on.
      - A Claim bonus alone starts a clock.
- [ ] **Reminders, vitest table.**
      - The 3-, 2- and 1-month emails go once each per clock.
      - A purchase starts a new clock with its own three.
      - Only the latest due reminder goes after a missed day.
      - None goes below `points_min_redeem` or with the switch off.
- [ ] **The switch.** Turning it off from the Profile writes a preference event and stops the
      next reminder.
- [ ] `./scripts/graphify update .` is run in the same commit.
