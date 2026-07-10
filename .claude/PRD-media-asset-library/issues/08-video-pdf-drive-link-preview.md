# Slice 08 — Video/PDF Drive import as link-only Assets + preview

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 7–8
Modules: 4, 7

## What to build

Extend Drive import orchestrator and Media UI for **video** and **PDF** Assets: no Supabase copy; store Drive URL + metadata; preview in library detail and grid.

- Orchestrator: video/PDF MIME → create Asset with `kind=video|pdf`, `drive_url`, no `hosted_url`.
- Preview: PDF — embedded viewer or thumbnail + Open in Drive; video — Drive thumbnail + Open in Drive / embed preview if API provides.
- Paste and Select from Drive paths both support non-image kinds.
- Unit test: video/PDF branch does not call image ingest; hosted_url null.

## Acceptance criteria

- [ ] Importing a Drive PDF creates link-only Asset with in-library preview affordance.
- [ ] Importing a Drive video creates link-only Asset with thumbnail/preview.
- [ ] No large video/PDF bytes written to Supabase bucket.
- [ ] Orchestrator tests cover video/PDF branch.

## Blocked by

- Slice 06 — Paste Drive import (`06-paste-drive-link-import-image.md`)
