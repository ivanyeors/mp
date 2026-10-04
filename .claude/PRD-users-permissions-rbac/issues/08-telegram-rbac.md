# Slice 08 — Telegram under RBAC

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done (migration file written and checked locally; not yet applied to production)
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

- [x] Authorise tests: role ∩ link both required; deactivated Member refuses; archived profile refuses; read error refuses; `grants_all` role + link action allows.
- [x] Migration test: every operator has a profile; action sets match old roles; no linked `telegram_user_id` lost.
- [x] Existing route tests in `app/api/staff/telegram-operators/__tests__` updated and passing.
- [ ] (slice 12) Manual: an existing review manager can still Post on a preview card after migration (slice 12).
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **Authorisation reads link → profile → Member → role in four small queries**, not one join. Taps are rare, every read failure refuses, and it keeps the check testable against the in-memory fake. Reasons: `not_linked`, `inactive` (link off), `profile_archived`, `member_inactive`, `role_forbidden` (names the role), `forbidden` (link lacks the action); each has its own bot reply.
- **The bot names effective actions**, not a role: "You're set up as Ivan (Reply to Google reviews, Moderate shop reviews)" — the link's actions the role also grants.
- **Legacy `role` follows `actions`** via a trigger (`review_manager` if reply is on, else `shop_moderator` if moderate is on, else the new `none`), so a rolled-back app reads the same access; `display_name` is stamped with the profile name.
- **A link can't grant beyond its login's role** (400, names the role) **or beyond the actor** (403 for a non-Owner/Admin). A role later narrowed leaves the link's actions as they are; the matrix wins at tap time and the tab shows "(granted, but the role doesn't allow it)".
- **One link per profile** (unique index; 409); archived profiles can't be linked; a profile deleted by a revoked invite takes its link with it (`on delete cascade`).
- **New links start with the actions the role allows and the actor may grant.**
- `PATCH` takes exactly one change (`actions`, `is_active`, or `action: new_link_code | unlink`); audits `telegram_link.create | update | turn_on | turn_off | new_link_code | unlink | delete` with before/after action lists (rendered as added/removed on the Audit Log).
- `TELEGRAM_ROLES`, `telegramRoleCan` and the role labels are gone from code; `lib/telegram/roles.ts` now describes the catalog's `telegram.*` actions.

## Blocked by

- Slice 06 — Telegram rows in the matrix.
- Slice 07 — Staff profiles under Members.
