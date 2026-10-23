# 02 — The points ledger, the balance, the settings, and Staff adjustments

**Issue:** not filed
**Type:** AFK
**Status:** built
**Blocked by:** 01
**User stories:** 3, 10, 11, 12
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:account`

## Goal

A balance exists, can be read, and can be changed by Staff with a reason, before anything earns
or spends. The demo: Staff add 500 points to a Customer with a note, and that customer sees
"500 points (S$5.00)" on their Profile.

## Schema

- **The ledger.** `points_ledger` exactly as in the PRD. It is server-only: RLS on, no policy,
  and `revoke all … from anon, authenticated`, including on its sequence.
- **Append-only.** A trigger refuses `update` and `delete`, as `customer_consent_events` does
  (`20261020120000_marketing_consent.sql:73-118`).
- **`points_balance(p_customer_id)`.** A SECURITY DEFINER function, service role only. It
  returns:
  - `available`: the sum of entries;
  - `pending`: the sum of `floor(rate × base)` over paid Orders after `points_launch_at` whose
    window is still open and which have no `earn` entry;
  - `last_purchase_at`: the latest paid Order, or the Claim bonus if later;
  - `expires_on`: `last_purchase_at` plus `points_expiry_months`, null when `available` is 0.
- **`adjust_points(p_customer_id, p_points, p_note, p_profile_id)`.**
  - It writes an `adjust` entry.
  - It refuses an empty note, a removal that would take the balance below zero, and any
    partner (rule r).
- **`is_partner_customer(p_customer_id)`.** Rule (r) as one SQL function, so the earn job, the
  Claim and the adjustment all ask the same question. TypeScript mirrors it for checkout, with a
  parity test.
- **Settings.** The eight `points_*` keys in `site_settings`. Every default from the PRD is
  seeded, including `points_claim_bonus = 1000` and `points_claim_bonus_months = 3`, with
  `points_enabled = 'false'`. Only `points_launch_at` is left blank for the owner.

## Surfaces

- **Customer detail → Points card** (`customers` permission to see it):
  - available, pending and the expiry date;
  - the latest 20 entries, each with its kind, points, dollars, Order link and note.

  **Adjust** needs `customers-edit`, a reason, and a confirmation. It writes `admin_audit_log`.
  For a partner, the card says "Partner: points don't apply", with no Adjust button.
- **Settings → Discounts → Points card** (`discounts` permission):
  - the eight settings, with server-side validation;
  - a cost summary from one view, `admin_points_summary`:
    - outstanding available, in points and S$;
    - pending;
    - spent, expired and clawed back this month and in total;
    - Claim bonuses granted.
- **Profile (`/account`) → Points card,** shown only while `points_enabled`:
  - "2,130 points (S$21.30)", pending points with "usable from" dates, and "Expires on" with
    the date;
  - a link to the terms page (slice 08).

  Before the launch (`points_enabled` off, or the launch date not yet reached) the card says
  **Coming soon** instead, with the earn rate, what 100 points are worth, and the terms link,
  and no balance (owner, 2026-10-23). Once points are switched off after a launch it shows
  nothing, since customers may hold points by then. Partners never see either card
  (`profilePointsView` in `lib/points/settings.ts`).

  The data is read server-side with the service role, keyed by the session's own Customer
  (`app/[lang]/account/page.tsx:47-60`). The welcome-back voucher card stays until slice 05.

## Acceptance criteria

- [x] `update` and `delete` on `points_ledger` raise, for every role including the service role.
- [x] `anon` and `authenticated` can neither read the ledger nor execute either function (SQL
      assert, like `assert-grants.sql`).
- [x] An adjustment with no note, one that would take the balance below zero, or one for a
      partner is refused.
- [x] `is_partner_customer` matches a partner by login and by email (case-insensitive). It does
      not match a customer whose partner application was not approved.
- [x] Adjust is refused for a role without `customers-edit`. Its audit row names the Staff
      profile.
- [x] The Profile shows only the session's own balance, and no balance before points are live:
      "Coming soon" before the launch, nothing once switched off after it.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `claude/admiring-ride-40h2o6` (`20261021120000_points_ledger.sql`).

- **SQL.** `points_ledger` as specified, with a sign check per kind and a required note on
  `adjust`; append-only by trigger for every role (cascades from a deleted Customer or Order
  pass). `points_settings()` reads the eight keys with their defaults. `is_partner_customer()`
  also matches a verified backup email, as `loadPartnerRow` does. `points_order_candidates` is
  every Order that earns or will earn, with its points and `release_at`; it is the Customer's
  pending points now and slice 03's release list. `points_balance()`, `adjust_points()` (row lock
  on the Customer, the lock slice 04 takes too) and `admin_points_summary`.
- **Code.** `lib/points/`: `value.ts` (100 points = S$1, "2,130 points (S$21.30)"), `settings.ts`
  (defaults, parse, the Settings schema), `partner.ts` (rule r in TypeScript), `kinds.ts`,
  `server.ts` (every read and write).
- **Surfaces.** Customer detail → *Points* (`points-card.tsx`, `GET/POST
  /api/shop/customers/[id]/points`); Discounts → *Points* (`points-settings-card.tsx`, `GET/PUT
  /api/settings/discounts/points`); Profile → *Your points* (`components/account/points-card.tsx`),
  only while points are on and never for a partner.
- **Tests.** `supabase/tests/loyalty-points/assert-02-ledger.sql` (grants, append-only for the
  service role too, signs, the partner cases, adjustments, candidates and the balance, the
  summary); `partner-cases.json`, which `lib/points/__tests__/points.test.ts` also runs; the two
  route tests; the Profile card render. The SQL window (30 days) is held to
  `DEFAULT_RETURN_WINDOW_DAYS` by a test.
