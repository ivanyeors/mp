# Slice 05 — Drive connector: resolve URL + browse Shared Drives/folders

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 27–28
Modules: 3

## What to build

Deep **Drive connector** module + thin admin API routes. No Asset creation yet — read-only browse and resolve.

- Extend shared Google OAuth client with Drive API access (reuse `getGoogleAccessToken` pattern).
- `resolveUrl(pasteUrl)` → file id, name, mimeType, thumbnailLink, size.
- `listSharedDrives()` → id + name.
- `listFolder(driveId?, folderId?)` → folders + files with pagination cursor.
- `downloadFile(fileId)` → bytes stream (for slice 06).
- Admin routes: `GET /api/media/drive/resolve?url=`, `GET /api/media/drive/browse?...` (admin `media` permission).
- Error mapping: file not found, insufficient Drive access, invalid URL.

## Acceptance criteria

- [ ] Paste URL resolve returns metadata for a file in a Shared Drive the workspace account can access.
- [ ] Browse lists Shared Drives and folder contents with pagination.
- [ ] Routes reject unauthenticated/non-admin callers.
- [ ] Connector logic isolated in testable module (HTTP mocked or manual smoke against staging after slice 02).

## Blocked by

- Slice 02 — Drive OAuth ops (`02-ops-drive-oauth-shared-drives.md`)
