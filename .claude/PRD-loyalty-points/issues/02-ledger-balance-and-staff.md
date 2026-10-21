# 02 — The points ledger, the balance, the settings, and Staff adjustments

**Issue:** not filed
**Type:** AFK
**Status:** not started
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
  - It refuses an empty note, and refuses a removal that would take the balance below zero.
- **Settings.** The eight `points_*` keys in `site_settings`. Only `points_enabled = 'false'`
  and the four defaults are seeded. The launch date and the Claim bonus are left blank for the
  owner.

## Surfaces

- **Customer detail → Points card** (`customers` permission to see it):
  - available, pending and the expiry date;
  - the latest 20 entries, each with its kind, points, dollars, Order link and note.

  **Adjust** needs `customers-edit`, a reason, and a confirmation. It writes `admin_audit_log`.
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

  The data is read server-side with the service role, keyed by the session's own Customer
  (`app/[lang]/account/page.tsx:47-60`). The welcome-back voucher card stays until slice 05.

## Acceptance criteria

- [ ] `update` and `delete` on `points_ledger` raise, for every role including the service role.
- [ ] `anon` and `authenticated` can neither read the ledger nor execute either function (SQL
      assert, like `assert-grants.sql`).
- [ ] An adjustment with no note, or one that would take the balance below zero, is refused.
- [ ] Adjust is refused for a role without `customers-edit`. Its audit row names the Staff
      profile.
- [ ] The Profile shows only the session's own balance, and nothing while `points_enabled` is off.
- [ ] `./scripts/graphify update .` is run in the same commit.
