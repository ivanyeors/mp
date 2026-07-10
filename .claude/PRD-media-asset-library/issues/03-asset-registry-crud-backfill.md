# Slice 03 — Asset registry: table + CRUD API + backfill bucket files

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 1, 23–24
Modules: 1

## What to build

End-to-end **Media Asset registry** — the foundation module everything else builds on.

- Migration: `media_assets` table per PRD schema (kind, name, alt, hosted_url, drive fields, mime, dimensions, timestamps, last_used_at, created_by).
- Admin API: list (search by name), get by id, update (rename, alt), delete (soft or hard per existing patterns).
- Backfill script or admin one-shot: enumerate existing Supabase `media` bucket objects → insert Asset rows with `kind=image` and `hosted_url`.
- Settings Media page lists Assets from DB instead of raw bucket list (read-only grid OK; upload comes slice 04).
- Unit tests: create/update validation, kind enum, backfill idempotency (skip or upsert on same hosted_url).

## Acceptance criteria

- [x] `media_assets` migration applied; types generated/updated.
- [x] Admin CRUD routes require `media` permission.
- [x] Backfill registers existing bucket files; re-run does not duplicate rows.
- [x] Media page shows Asset grid with name, kind, created date.
- [x] Tests cover registry module external behavior.

## Blocked by

- Slice 01 — Domain glossary (`01-domain-glossary-media-asset.md`)
