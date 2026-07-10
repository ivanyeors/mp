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

- [ ] Checklist committed and executed on staging with pass/fail notes.
- [ ] All critical paths signed off or filed as follow-up with issue reference.
- [ ] No blocker bugs open for scope 1 core flows before production promotion.

## Blocked by

- Slice 07 — Select from Drive (`07-select-from-drive-dialog-import.md`)
- Slice 08 — Video/PDF link (`08-video-pdf-drive-link-preview.md`)
- Slice 12 — Picker roll-out (`12-asset-picker-rollout.md`)
- Slice 14 — Tags/kind filter (`14-organization-tags-kind-filter.md`)
