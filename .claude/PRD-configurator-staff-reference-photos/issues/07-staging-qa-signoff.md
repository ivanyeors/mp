# 07 — Staging QA sign-off

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

Manual end-to-end verification of the whole feature on staging/prod before release. No new
code beyond fixes surfaced during QA.

Walk both **Mpillow** and **Mbolster**:

- **Gating** — signed out / non-admin: the upload form is absent; customer **Sizing photo**
  step still works. Signed in as an approved admin: the form appears above Contact.
- **Upload** — add several images incl. a large (>4 MB) landscape phone photo; thumbnails
  render; images are stored as WebP ≤2400px; delete removes storage object + row.
- **Limits** — the 11th image and a >15 MB file are refused with a clear toast; a
  non-image file is refused.
- **DAM** — the uploaded images do **not** appear in `/settings/media`.
- **Delivery** — pillow: mark final → Telegram group receives references (batched if >10);
  both: complete a hold → `results/[id]` shows the **Reference photos** gallery (bolster
  included, via session id == responseId).

## Acceptance criteria

- [ ] Gating verified on both forms (hidden for non-admin, visible for admin; sizing photos intact)
- [ ] Upload / compress / delete verified end-to-end
- [ ] Count / size / mime refusals verified
- [ ] Reference photos confirmed absent from the Media Asset library
- [ ] Telegram delivery (pillow) and Result-detail gallery (both products) verified
- [ ] Human sign-off (HITL)

## Blocked by

- 03 — Pillow reference-photo upload UI
- 04 — Bolster reference-photo upload UI + session UUID
- 05 — Result-detail Reference photos gallery
- 06 — Telegram append of reference photos (pillow)
