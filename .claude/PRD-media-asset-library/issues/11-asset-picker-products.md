# Slice 11 — Asset picker: replace ImagePicker; wire products

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 19–21
Modules: 6, 5

## What to build

New **Asset picker** component (evolve `ImagePicker`): browse library, search, filter used/unused; select returns `{ assetId, url, alt? }`.

- First consumer: **Storefront product** editor — product gallery images store Asset id (new column on `product_images` or parallel field) + url for display/back-compat.
- Saving product image triggers usage resolver last_used_at.
- Image-only filter in picker for this consumer.

## Acceptance criteria

- [x] Product editor Browse opens Asset picker; selection adds gallery image with asset id persisted.
- [x] Legacy product rows with url-only still display and count as used via URL scan.
- [x] Picker requires admin auth; lists Assets from registry API.

## Blocked by

- Slice 03 — Asset registry (`03-asset-registry-crud-backfill.md`)
- Slice 10 — Usage resolver (`10-usage-resolver-v1.md`)
