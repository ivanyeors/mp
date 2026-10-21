# 05 — The Claim bonus replaces the voucher, for every customer-facing surface

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02, 04
**User stories:** 7
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:account`, `area:email`

## Goal

A Migrated customer who claims within their window holds a **Claim bonus** of 1,000 points
(S$10), which they can spend at once. One who claimed before points existed gets it at their next
sign-in, if their Claim fell inside the window. Every customer-facing place that promised a
voucher now states the bonus.

## The window (rules f, g)

`claim_bonus_window_end(p_customer_id)` returns one of three things:

- **`null`, meaning still open,** when no campaign email has been sent to anyone yet.
- **For a customer we emailed:** the earliest `sent_at` in `customer_campaign_sends` for that
  Customer, plus `points_claim_bonus_months` (3).
- **For a customer we never emailed:** the earliest `sent_at` across `customer_campaign_sends`
  (the first wave), plus 3 months.

There is no calendar date to set. The clocks are facts the sender already stores (migration
slice 08).

## Scope

**The Claim** (`claim_migrated_customer`, `20261020112100_welcome_back_voucher.sql`). The
`claimed_at` update stays exactly as it is (`:100-106`). After it:

- **The grant.** The bonus is inserted when every condition holds:
  - `points_enabled` and `points_claim_bonus > 0`;
  - the Customer has `claimed_at`, and `claimed_at` ≤ their window end (or the window is open);
  - the Customer is not a partner (rule r);
  - the Customer has no `claim_bonus` entry.

  `points_ledger_one_claim_bonus` makes this race-safe.
- **Earlier claimers.** The grant does not depend on this call being the one that stamped
  `claimed_at`, and that is the backfill. The cost on later sign-ins is one index probe.
- **The voucher insert goes.** The function returns `claimed`, `bonus_granted` and
  `bonus_email_due`.

**The email.**

- `account.claim_bonus` replaces `account.welcome_voucher` (`lib/email/account.ts:32-77`;
  registry `:317-331`). It is sent once per Customer through `dispatchCustomerEmail`.
- It says: "S$10 in points is in your account. Use it on any shop order, up to half the price."
- **Classification.** It is the same as slice 05 of the migration: a confirmation of what the
  customer just did. The same counsel note carries over (slice 08), so if counsel calls it
  commercial, gate the send on Marketing consent in `claimOnSignIn`.

**The migration emails** (`lib/email/migration.ts`):

- The announcement (`:103-145`) and the reminder (`:147-177`) state the bonus in dollars, and
  that it lasts 3 months from that email.
- `voucherOfferPhrase` (`:90`) becomes `claimBonusPhrase`.
- The subject "Your welcome-back voucher is waiting" becomes "S$10 in points is waiting in your
  Mpillow account".

**The wave sender's preflight** (`lib/customer-migration/wave-sender.ts:245-260`):

- The offer templates now require all of:
  - `points_enabled`;
  - a Claim bonus above 0;
  - a launch date that has passed (spending is live).
- `renderCampaignEmail`'s second guard follows the same rule.

**The welcome page and the Profile.**

- `/account/welcome` shows a Claim bonus card in place of the voucher card
  (`app/[lang]/account/welcome/welcome-view.tsx:117`).
- **When the window has closed,** the card says so plainly. It never promises a bonus the Claim
  will not grant.
- The Profile drops the voucher card (`app/[lang]/account/page.tsx:87-89`). Slice 02's Points
  card already shows the bonus.
- The wrong-account copy "Your voucher was sent to the email you shopped with" (`:54`) becomes
  "Sign in with the email you shopped with to see your points." It no longer claims anything
  was sent.

## Acceptance criteria

- [ ] **The race.** Two concurrent Claims for one Customer give one `claimed_at` and one Claim
      bonus (SQL assert, the slice 05 race rewritten for the bonus).
- [ ] **The window, SQL assert.**
      - An emailed customer claiming 3 months less a day after their first email is granted.
      - A day after that, nothing is granted.
      - A never-emailed customer is timed from the first wave.
      - Before any wave, every Claim is granted.
- [ ] **Earlier claimers.** A Customer claimed while points were off, inside their window, gets
      the bonus at their next sign-in, even if that sign-in is after the window.
- [ ] **No grant.** Non-migrated Customers and partners get nothing, and write nothing beyond
      today's sign-in.
- [ ] **Preflight.** It refuses the announcement while the bonus is 0, points are off, or
      spending has not launched.
- [ ] **End to end.** Claim, then the Points card shows S$10, then a S$25 cover sheet takes S$10
      off at checkout.
- [ ] `./scripts/graphify update .` is run in the same commit.
