# Slice 02 — HITL: Drive API + OAuth re-consent + Shared Drive access

Type: HITL
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 28, 47

## What to build

Complete manual Google Workspace setup so engineering can call Drive API as **`sg@mpillow.com`** (main media identity). Appointments keep **`admin@mpillow.com`** on the existing refresh token.

- Enable **Google Drive API** on the same GCP project as existing Calendar/Contacts OAuth.
- Add Drive scope to OAuth consent (`https://www.googleapis.com/auth/drive.readonly` minimum; `drive` if download requires it).
- Skip Drive UI Integration / Open URL (API-only).
- One-time OAuth consent as **`sg@mpillow.com`** with Drive scope only → store `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`.
- Do **not** replace `GOOGLE_OAUTH_REFRESH_TOKEN` (stays `admin@` for Calendar + Contacts).
- Confirm `sg@` is a member of company **Shared Drives** that hold marketing media.
- Smoke test: list Shared Drives, list one folder, download one test image, resolve a paste URL; appointments still work.
- Document in `.env.example` and `OPS-CHECKLIST.md`.

## Acceptance criteria

- [ ] Drive API enabled; Drive refresh token works for `files.list`, Shared Drives list, and file download as `sg@`.
- [ ] At least one production Shared Drive visible to `sg@mpillow.com` documented by name/id.
- [x] Ops checklist committed under `.claude/PRD-media-asset-library/`.
- [x] `.env.example` documents `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`; appointments token unchanged.

## Blocked by

None — can start immediately.
