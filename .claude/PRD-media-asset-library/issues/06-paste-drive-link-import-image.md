# Slice 06 — Paste Drive link → preview → import image Asset

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 4, 6, 29
Modules: 3, 4, 2, 7

## What to build

**Drive import orchestrator** first path: paste Google Drive URL on Media page → preview card → Import creates image Asset.

- UI: URL input + Preview button showing name, kind, thumbnail.
- Import: resolve → if image MIME → download via connector → image ingest → create Asset with hosted_url + drive_file_id + drive_url.
- One-time import; duplicate drive_file_id returns existing Asset or clear error.
- Unit tests: orchestrator branches — image MIME triggers ingest; sets provenance fields.

## Acceptance criteria

- [ ] Staff pastes Shared Drive image link, sees preview, imports → Asset with hosted_url and Drive provenance.
- [ ] Imported image is optimized WebP in Supabase (same pipeline as slice 04).
- [ ] Re-importing same drive_file_id is handled idempotently.
- [ ] Orchestrator kind-branch tests pass.

## Blocked by

- Slice 04 — Direct upload optimize (`04-direct-upload-optimize-asset.md`)
- Slice 05 — Drive connector (`05-drive-connector-browse-apis.md`)
