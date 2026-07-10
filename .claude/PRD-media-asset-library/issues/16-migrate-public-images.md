# Slice 16 — Migrate `/public` marketing images into Asset library

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 43, 45
Modules: 9, 2

## What to build

**Scope 3** — migrate static marketing images from `/public` into managed Assets.

- Inventory script: list known `/public` paths referenced by landing defaults, blogs, slide configs, and live site_settings.
- For each path: read file from repo or fetch deployed static URL → image ingest → create Asset → rewrite consumer to hosted_url (+ asset id where slice 15 landed).
- Idempotent migration command (tsx script or admin job) with dry-run mode.
- Document which paths migrated vs intentionally left static.

## Acceptance criteria

- [ ] Known landing hero defaults that pointed at `/public` now use Supabase hosted Assets.
- [ ] Dry-run reports planned changes; apply mode updates DB/settings without duplicating Assets on re-run.
- [ ] Live landing pages render migrated images via optimized hosted URLs.
- [ ] Migration log or README section lists migrated paths.

## Blocked by

- Slice 04 — Upload optimize (`04-direct-upload-optimize-asset.md`)
- Slice 15 — Replace + landing ids (`15-replace-everywhere-landing-asset-ids.md`)
