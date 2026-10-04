# Slice 07 — Staff profiles under logins

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done (migration file written and checked locally; not yet applied to production)
User stories covered: 9, 25–29

## What to build

Give every `mp_staff` row an owning Member: one login, many Staff profiles.

**Migration:**

- `mp_staff` + `admin_user_id uuid references admin_users(id) on delete restrict`, + `archived_at timestamptz`.
- Backfill existing rows to `sg@mpillow.com` (PRD decision 1), looked up by email in the migration, not by id. Then `admin_user_id set not null`.
- For every Member with no profile, insert one named from the email local part (today: `ivanyeoart`, `admin`).
- Replace `idx_mp_staff_name_unique` with a partial unique index on `(admin_user_id, lower(name)) where archived_at is null`.

**Live data (2026-10-04):** 6 rows (Kai Lin, Ivan, Darren, Jess, Wang Ying, Winnie), no name collisions under `sg@mpillow.com`, and no `mp_config_responses.measured_by_staff_id` references yet. `mp_staff` has no `is_active` column, so `archived_at` is the first lifecycle field. Re-check before running in production.

**Code:**

- `lib/staff/admin.ts`: `listStaffProfiles({ includeArchived })` returning `{ id, name, memberId, memberEmail, archivedAt }`; `createStaffProfile(memberId, name)`; `renameStaffProfile`; `moveStaffProfile(id, memberId)`; `archiveStaffProfile` / `restoreStaffProfile`. All writes audited (`staff_profile.*`).
- `/api/staff`: GET (`results` or `users`) adds owner + archived; POST/PATCH (`users`) for the above. No DELETE.
- **Staff profiles tab:** grouped by Member (email + role pill), each group lists profiles with rename inline, "Move to…" Member select, Archive; "Show archived" toggle; "Add profile" per Member. Members tab shows the profile count linking here filtered.
- **Results measured-by picker** (`results-client.tsx`): options grouped by Member email, archived hidden from options but still labelled on rows that reference them ("Jane (archived)").

## Acceptance criteria

- [x] Migration test: every Member has ≥1 profile; every pre-existing profile has an owner; no Result's `measured_by_staff_id` changed.
- [x] Unit tests for create/rename/move/archive including name clash within a Member (409) and same name under two Members (allowed).
- [x] Archived profile cannot be picked for a new measured-by (API refuses), but existing rows keep it.
- [x] `graphify-out/` refreshed.

## Decisions made while building

- **Backfill falls back** to the oldest active Owner if `sg@mpillow.com` is ever missing, so `set not null` cannot fail on a renamed login.
- **First-profile names** come from the email's local part with `.`, `_`, `-` as word breaks, title-cased (`ivanyeoart` → "Ivanyeoart"). The same rule (`defaultProfileName`) names the profile a bootstrap Owner gets on first sign-in.
- **`mp_staff` client grants revoked.** Its public policies were already dropped by `20260902000000`; profiles now carry Telegram access, so no browser role may touch them.
- **Name clashes are checked in code** (case-insensitive, live profiles under the same login) before the partial unique index, for a readable 409; moving into a clash and restoring into a clash are refused too.
- **`PATCH /api/staff/[id]` takes exactly one change** (`name`, `memberId` or `archived`), so each lands in the Audit Log as its own `staff_profile.rename|move|archive|restore`.
- **Results "measured by"**: `/api/staff?includeArchived=1` feeds labels ("Jess (archived)"); the picker shows live profiles grouped by login (headings only when there is more than one login) and the row's own archived profile as a disabled option. `POST /api/mp-config/responses` refuses newly picking an archived or missing profile, and leaves a row that already names one alone.
- `SelectGroupLabel` added to `components/ui/select.tsx` for the group headings.
- Members tab shows each login's live profile count, linking to its group on the Staff profiles tab.

## Blocked by

- Slice 04 — page shell.
