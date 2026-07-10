# Slice 09 — Asset detail: rename, alt, Open in Drive, delete guard

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 9–12
Modules: 1, 5, 7

## What to build

Asset **detail sheet** on Media page: full metadata edit and safe delete.

- Rename display name; edit alt text (images).
- Open in Drive link when drive_url present.
- Manual **Re-import from Drive** for image Assets (re-download, re-optimize, replace hosted file).
- Delete: call usage resolver — block or confirm if used; optional force for admins with warning.
- Wire PATCH/DELETE Asset API from slice 03.

## Acceptance criteria

- [x] Detail sheet opens from grid; rename and alt persist.
- [x] Open in Drive opens correct file for imported Assets.
- [x] Delete blocked with usage list when Asset is attached.
- [x] Re-import from Drive replaces hosted image bytes for image Assets.

## Blocked by

- Slice 03 — Asset registry (`03-asset-registry-crud-backfill.md`)
