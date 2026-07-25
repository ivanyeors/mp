# 04 — Bolster reference-photo upload UI + session UUID

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

The same **Reference photo** upload on the custom **Mbolster** form, plus the session-id
plumbing bolster needs (it has no response record).

- Render the `ConfigImageUpload` component from slice 03 above `PreviewContactFields` on
  `mbolster-config`, gated by `staffAssist`.
- Mint a session UUID (`crypto.randomUUID()`) on first use and persist it in the existing
  bolster hold draft (localStorage). Use it as the `sessionId` for uploads, and pass it as the
  `responseId` when the hold is created — so the resulting **Result** id equals the session id
  and the gallery (slice 05) finds the images with no extra column.
- Confirm the bolster page server component computes `staffAssist` via `getAdminContext()` as
  `mp-config` does; add it if missing (this is the visibility gate).

## Acceptance criteria

- [ ] Upload form appears above Contact on `mbolster-config` only when `staffAssist` is true
- [ ] A bolster session UUID is minted, persisted in the hold draft, and used as the upload `sessionId`
- [ ] The bolster hold is created with that UUID as `responseId` (Result id == session id)
- [ ] Uploaded bolster images are retrievable by that session id after a hold completes
- [ ] Non-admin / signed-out users do not see the form

## Blocked by

- 02 — `config_upload` backend
- 03 — Pillow reference-photo upload UI (shared component)
