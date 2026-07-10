# Slice 14 — Organization: tags + filter by kind

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 36–38
Modules: 8, 7

## What to build

**Scope 2** — tags and kind filters on Media library and picker.

- Tags: text array on Asset; add/remove in detail sheet; tag autocomplete from existing tags optional.
- Kind filter chips: image | video | pdf | all.
- Combine filters: kind + folder + tag + used/unused + search.
- Picker inherits kind filter (image-only mode vs all kinds).

## Acceptance criteria

- [ ] Staff adds tags to an Asset; filter by tag narrows grid.
- [ ] Kind filter shows only images, videos, or PDFs.
- [ ] Combined filters work together without empty-state bugs.
- [ ] Tag/kind filters available in Asset picker.

## Blocked by

- Slice 13 — Folders (`13-organization-folders.md`)
