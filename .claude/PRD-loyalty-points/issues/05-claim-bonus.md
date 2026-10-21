# 05 — The Claim bonus replaces the voucher, for every customer-facing surface

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02, 04
**User stories:** 7
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:account`, `area:email`

## Goal

A Migrated customer who signs in holds a **Claim bonus** in points, which they can spend at
once. One who claimed before points existed gets it at their next sign-in, inside the bonus
window. Every customer-facing place that promised a voucher now states the bonus.

## Scope

**The Claim** (`claim_migrated_customer`, `20261020112100_welcome_back_voucher.sql`). The
`claimed_at` update stays exactly as it is (`:100-106`). After it:

- **The grant.** If `points_enabled`, `points_claim_bonus > 0`, today ≤
  `points_claim_bonus_until`, the Customer has `claimed_at`, and the Customer has no
  `claim_bonus` entry, insert one. `points_ledger_one_claim_bonus` makes this race-safe.
- **Earlier claimers.** The grant does not depend on this call being the one that stamped
  `claimed_at`, and that is the backfill. The cost on later sign-ins is one index probe.
- **The voucher insert goes.** The function returns `claimed`, `bonus_granted` and
  `bonus_email_due`.

**The email.**

- `account.claim_bonus` replaces `account.welcome_voucher` (`lib/email/account.ts:32-77`;
  registry `:317-331`). It is sent once per Customer through `dispatchCustomerEmail`.
- It says: "S$20 in points is in your account. Use it on any shop order, up to half the price."
- **Classification.** It is the same as slice 05 of the migration: a confirmation of what the
  customer just did. The same counsel note carries over, so if counsel calls it commercial,
  gate the send on Marketing consent in `claimOnSignIn`.

**The migration emails** (`lib/email/migration.ts`):

- The announcement (`:103-145`) and the reminder (`:147-177`) state the bonus in dollars.
- `voucherOfferPhrase` (`:90`) becomes `claimBonusPhrase`.
- The subject "Your welcome-back voucher is waiting" becomes "S$20 in points is waiting in your
  Mpillow account".

**The wave sender's preflight** (`lib/customer-migration/wave-sender.ts:245-260`):

- The offer templates now require all of:
  - `points_enabled`;
  - a Claim bonus above 0;
  - a bonus window still open;
  - a launch date that has passed (spending is live).
- `renderCampaignEmail`'s second guard follows the same rule.

**The welcome page and the Profile.**

- `/account/welcome` shows a Claim bonus card in place of the voucher card
  (`app/[lang]/account/welcome/welcome-view.tsx:117`).
- The Profile drops the voucher card (`app/[lang]/account/page.tsx:87-89`). Slice 02's Points
  card already shows the bonus.
- The wrong-account copy "Your voucher was sent to the email you shopped with" (`:54`) becomes
  "Sign in with the email you shopped with to see your points." It no longer claims anything
  was sent.

## Acceptance criteria

- [ ] **The race.** Two concurrent Claims for one Customer give one `claimed_at` and one Claim
      bonus (SQL assert, the slice 05 race rewritten for the bonus).
- [ ] **Earlier claimers, inside the window.** A Customer claimed while points were off gets the
      bonus at their next sign-in inside the window.
- [ ] **Earlier claimers, outside it.** After the window closes, they get nothing.
- [ ] **Non-migrated Customers.** One signing in gets no bonus and writes nothing beyond today's
      sign-in.
- [ ] **Preflight.** It refuses the announcement while the bonus is unset, the window is closed,
      or spending has not launched.
- [ ] **End to end.** Claim, then the Points card shows S$20, then a S$45 cover takes S$20 off at
      checkout.
- [ ] `./scripts/graphify update .` is run in the same commit.
