# Slice 18 — Staging E2E signoff: full library QA checklist

Type: HITL
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 47
Modules: 7+ (all)

## What to build

Staging **E2E signoff checklist** and manual QA pass covering all three scopes. Document in `OPS-CHECKLIST.md` (append to slice 02 ops doc or separate signoff section).

Checklist must cover:

- Direct image upload → optimized Asset in grid
- Paste Drive link → preview → import (Shared Drive image)
- Select from Drive → folder navigation → import
- Video/PDF link import + preview
- Rename, alt, Open in Drive, re-import
- Used/unused badges and attachment list
- Delete guard on used Asset
- Asset picker on product + at least one rolled-out consumer (blog or landing)
- Folder assign + filter; tag + kind filter
- Replace-everywhere on a test Asset
- Spot-check migrated `/public` path if slice 16 shipped
- Confirm admin-only API auth (no public Asset list)

## Acceptance criteria

- [x] Checklist committed and executed on staging with pass/fail notes.
- [x] All critical paths signed off or filed as follow-up with issue reference.
- [x] No blocker bugs open for scope 1 core flows before production promotion.

## How it works

- Checklist lives in `.claude/PRD-media-asset-library/OPS-CHECKLIST.md` §7.
- Runner: `scripts/smoke-staging-e2e-signoff.ts` executes all automated proofs and prints a pass/fail matrix.
- Signoff fix: `GET /api/media` and `GET /api/media/usage` now call `requireAdmin("media")` (were publicly listable).

## Proof

| Criterion | Proof |
|-----------|--------|
| Checklist committed | `OPS-CHECKLIST.md` §7 |
| Upload → WebP Asset | `smoke-direct-upload.ts` |
| Drive paste / browse / video-PDF | `smoke-drive-import.ts`, `smoke-drive-browse-import.ts`, `smoke-drive-video-pdf.ts` |
| Detail + delete guard | `smoke-drive-asset-detail.ts` |
| Usage badges | `smoke-usage-resolver.ts` |
| Picker products + rollout | `smoke-asset-picker-products.ts`, `smoke-asset-picker-rollout.ts` |
| Folders / tags+kind | `smoke-media-folders.ts`, `smoke-media-tags-kind.ts` |
| Replace-everywhere | `smoke-replace-everywhere.ts` |
| Migrated `/public` + slides | `smoke-migrate-public-images.ts`, `smoke-migrate-slide-images.ts` |
| Admin-only auth | `smoke-media-auth.ts` (401 on list/usage/assets/folders/drive) |
| Unit tests | **73/73** (`lib/media` + `lib/media-assets` + slide sections) |
| Smoke matrix | **`SMOKE_OK 14/14`** (`scripts/smoke-staging-e2e-signoff.ts`) |

Re-run:

```bash
npx tsx --env-file=.env.local scripts/smoke-staging-e2e-signoff.ts
npx vitest run lib/media lib/media-assets lib/product-slide-sections
```

## Follow-ups (non-blocking)

- Slice 02 leftover: confirm `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` on Vercel staging/prod if not already set.
- Optional UI walkthrough in Settings → Media (API paths above cover the same code).

## Blocked by

- Slice 07 — Select from Drive (`07-select-from-drive-dialog-import.md`)
- Slice 08 — Video/PDF link (`08-video-pdf-drive-link-preview.md`)
- Slice 12 — Picker roll-out (`12-asset-picker-rollout.md`)
- Slice 14 — Tags/kind filter (`14-organization-tags-kind-filter.md`)
