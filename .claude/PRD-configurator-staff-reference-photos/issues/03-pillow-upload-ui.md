# 03 — Pillow reference-photo upload UI

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

A signed-in admin on the custom **Mpillow** form can attach multiple **Reference photos**
above the Contact section, see thumbnails, delete any, and have them persist across reload.

- A self-contained, staff-only `ConfigImageUpload` component: `image/*` multi-file input with
  drag-drop (borrow the drop-zone pattern from the existing media picker), thumbnail grid with
  per-item delete and an uploading state, and toast errors (matching the existing `savePhoto`
  toasts). Hydrates from `GET /api/config-uploads?sessionId=` on mount; each add posts to the
  route from slice 02.
- Rendered in `mp-config` directly **above** `PreviewContactFields`, gated by `staffAssist`.
- Uses the existing `ensureResponseId` so the first upload lazily creates the response and the
  images key to it.

## Acceptance criteria

- [ ] Upload form appears above Contact on `mp-config` only when `staffAssist` is true
- [ ] A non-admin / signed-out user does not see the form; the customer **Sizing photo** step is unchanged
- [ ] Admin can select multiple images; each shows a thumbnail after upload
- [ ] Deleting a thumbnail removes the image (storage + row)
- [ ] Limit refusals (11th image, >15 MB, non-image) surface as clear toasts
- [ ] Reloading the configurator re-hydrates the previously uploaded images

## Blocked by

- 02 — `config_upload` backend
