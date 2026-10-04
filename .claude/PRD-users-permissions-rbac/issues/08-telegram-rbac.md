# Slice 08 — Telegram under RBAC

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
User stories covered: 11, 30–35

## What to build

Make Telegram review-card buttons a role permission, linked per Staff profile.

**Migration:**

- `telegram_operators` + `staff_profile_id uuid unique references mp_staff(id)`, + `actions text[] not null default '{}'`.
- For each operator row: match a Staff profile under `sg@mpillow.com` (PRD decision 1) by `lower(name) = lower(display_name)`, else create one; set `staff_profile_id`; `actions` = `{telegram.google-review-reply, telegram.shop-review-moderate}` for `review_manager`, `{telegram.shop-review-moderate}` for `shop_moderator` (full catalog keys). Then `staff_profile_id set not null`.
- Seeded custom roles do not get the `telegram.*` keys. No login role governs Telegram today, and `sg@mpillow.com` is an Owner (`grants_all`), so every migrated link keeps its current effect.

**Live data (2026-10-04):** 1 operator — "Ivan", `review_manager`, active, linked. It matches the existing "Ivan" profile and gets both actions. Re-check before running in production.

**Code:**

- `authorizeTelegramAction(telegramUserId, action)`: one query joining link → profile → Member → role; allow only when profile not archived, Member active, role grants the action's `telegram.*` key (or is `grants_all`), and `actions` contains it. Return reasons extended with `"member_inactive" | "role_forbidden"` so the bot's reply can say "your login no longer has this" vs "ask an admin to turn this on". Any read error refuses.
- `TELEGRAM_ROLES` / `telegramRoleCan` retired in favour of catalog keys; `TELEGRAM_ROLE_LABELS` become action labels.
- Issue link code, unlink, set actions, turn off: per Staff profile (`/api/staff/telegram-operators/*` keyed by profile; all `users`; audited `telegram_link.*`).
- **Telegram tab:** explanation + "Send preview" (unchanged) + table of profiles with a Telegram link or pending code: profile, login, Telegram handle / "waiting for /link", action checkboxes (disabled with tooltip when the login's role lacks the permission: "Studio login's role doesn't include this — change it on Roles"), New code / Unlink / Turn off. "Link a profile" picks any active profile.
- Staff profiles tab shows a Telegram icon on linked profiles.

## Acceptance criteria

- [ ] Authorise tests: role ∩ link both required; deactivated Member refuses; archived profile refuses; read error refuses; `grants_all` role + link action allows.
- [ ] Migration test: every operator has a profile; action sets match old roles; no linked `telegram_user_id` lost.
- [ ] Existing route tests in `app/api/staff/telegram-operators/__tests__` updated and passing.
- [ ] Manual: an existing review manager can still Post on a preview card after migration (slice 12).
- [ ] `graphify-out/` refreshed.

## Blocked by

- Slice 06 — Telegram rows in the matrix.
- Slice 07 — Staff profiles under Members.
