# Slice 13 — Organization: folders (assign, browse, filter)

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 34–35, 39
Modules: 8, 7

## What to build

**Scope 2** — folder organization on Media Assets.

- Migration: `media_folders` table (id, name, optional parent_id for flat-or-one-level hierarchy — prefer flat list v1 if simpler).
- Asset `folder_id` FK nullable.
- Media page: folder sidebar or dropdown filter; assign folder in detail sheet; create/rename folder inline.
- Asset picker: optional folder filter.

## Acceptance criteria

- [x] Staff creates folders and assigns Assets.
- [x] Library filters to selected folder.
- [x] Assets without folder appear in "Unfiled" or all view.
- [x] Folder CRUD requires admin `media` permission.

## Blocked by

- Slice 03 — Asset registry (`03-asset-registry-crud-backfill.md`)
