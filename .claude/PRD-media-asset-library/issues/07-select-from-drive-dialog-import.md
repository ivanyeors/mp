# Slice 07 — Select from Drive dialog → select → import

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 5
Modules: 3, 4, 7

## What to build

In-app **Select from Drive** dialog on Settings → Media page: browse Shared Drives → folders → files; select one or more files → import via orchestrator (same rules as paste: images download+optimize, video/PDF deferred to slice 08 or link-only if already in orchestrator).

- Dialog UX: breadcrumb, folder navigation, file rows with icon/thumbnail/name/kind, Import CTA.
- Reuse connector browse APIs from slice 05 and import orchestrator from slice 06.
- Loading and error states for large folders.

## Acceptance criteria

- [x] Staff opens Select from Drive, navigates Shared Drive folders, selects an image, imports → Asset in library.
- [x] Non-image selection either imports as link Asset (if slice 08 merged) or shows clear "supported in next step" — prefer completing link import if orchestrator already supports it.
- [x] Dialog requires admin session; no public access.

## Blocked by

- Slice 06 — Paste Drive import (`06-paste-drive-link-import-image.md`)
