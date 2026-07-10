# Slice 02 — HITL: Drive API + OAuth re-consent + Shared Drive access

Type: HITL
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 28, 47

## What to build

Complete manual Google Workspace setup so engineering can call Drive API as the workspace identity (`admin@mpillow.com`). Document an ops checklist in-repo (e.g. `OPS-CHECKLIST.md` under the PRD folder) mirroring the WhatsApp appointment confirm pattern.

- Enable **Google Drive API** on the same GCP project as existing Calendar/Contacts OAuth.
- Add Drive scope to OAuth consent (`https://www.googleapis.com/auth/drive.readonly` minimum; `drive` if download requires it).
- Re-run one-time OAuth consent for `admin@mpillow.com`; update `GOOGLE_OAUTH_REFRESH_TOKEN` in staging/prod env.
- Confirm workspace account is a member of company **Shared Drives** where `sg@` team stores media (files must be reachable via Shared Drives, not separate per-user OAuth).
- Smoke test: list Shared Drives, list one folder, download one test image, resolve a paste URL.
- Update `.env.example` with Drive scope comment on existing `GOOGLE_OAUTH_*` block.

## Acceptance criteria

- [ ] Drive API enabled; refresh token works for `files.list`, Shared Drives list, and file download.
- [ ] At least one production Shared Drive visible to `admin@mpillow.com` documented by name/id.
- [x] Ops checklist committed under `.claude/PRD-media-asset-library/`.
- [x] `.env.example` documents Drive scope requirement; no duplicate secret vars introduced.

## Blocked by

None — can start immediately.
