# 02 — `config_upload` backend: schema + module + guard + API + tests

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

The end-to-end backend tracer bullet: a signed-in admin can POST an image and it lands
compressed in storage with a row, list it back, and delete it — with the refusal rules and
the DAM-bypass locked down.

- Migration for `config_upload(id, session_id, storage_path, hosted_url, mime_type,
  byte_size, width, height, created_at)`, indexed by `(session_id, created_at)`, RLS
  service-role only.
- A `config-upload` module: `saveConfigUpload({ sessionId, bytes, originalName })` reuses the
  existing Sharp `optimizeImageForWeb`, uploads under a per-session folder in the existing
  `media` bucket, and inserts one `config_upload` row — **without** creating a Media Asset
  (stays out of the DAM). Plus `listConfigUploads(sessionId)` and `deleteConfigUpload(id)`
  (removes storage object + row).
- A pure `assertUploadAllowed(existingCount, fileSize, mimeType)` guard: ≤10 images/session,
  ≤15 MB/file, image mimes only; throws a typed refusal otherwise.
- `/api/config-uploads` route: `POST` (multipart `sessionId` + file), `GET ?sessionId=`,
  `DELETE ?id=`. Every handler gates on `getAdminContext()` non-null (the exact check behind
  `staffAssist`); `POST` runs `assertUploadAllowed` before `saveConfigUpload`.
- Unit tests for `assertUploadAllowed` and `saveConfigUpload` (see Testing Decisions).

## Acceptance criteria

- [ ] Migration creates `config_upload` (service-role-only RLS); applies locally
- [ ] `saveConfigUpload` stores an optimized WebP under a per-session path and inserts a row; does **not** create a Media Asset
- [ ] `listConfigUploads` / `deleteConfigUpload` work; delete removes both storage object and row
- [ ] `assertUploadAllowed` rejects the 11th image, an >15 MB file, and a non-image mime with typed refusals
- [ ] `POST`/`GET`/`DELETE /api/config-uploads` return 401 when no admin context; succeed for a signed-in admin
- [ ] Unit tests for `assertUploadAllowed` and `saveConfigUpload` pass in the existing runner

## Blocked by

- 01 — Glossary + ADR
