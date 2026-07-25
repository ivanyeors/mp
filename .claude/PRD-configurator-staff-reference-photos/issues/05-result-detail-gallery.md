# 05 — Result-detail Reference photos gallery (both products)

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

The build team can see a session's **Reference photos** on the Result detail page, for both
**Mpillow** and **Mbolster** (this is bolster's only delivery path).

- Extend the Result-detail read to also return the session's `config_upload` images
  (`listConfigUploads(id)`; id == session id for both products).
- Render a read-only **Reference photos** gallery in the Result detail build-details area:
  thumbnails that open full size. Absent / empty when there are no images.

## Acceptance criteria

- [ ] Result-detail API returns `referenceImages` for the requested id
- [ ] A **Reference photos** gallery renders on `results/[id]` when images exist
- [ ] Works for both a pillow Result and a bolster Result
- [ ] No gallery section shown when a Result has no reference images

## Blocked by

- 02 — `config_upload` backend
