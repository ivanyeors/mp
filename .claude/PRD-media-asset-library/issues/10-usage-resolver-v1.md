# Slice 10 — Usage resolver v1: scanners + used/unused + last_used_at

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 13–15, 30–32
Modules: 5, 7

## What to build

**Usage resolver** deep module + Media page badges + attach hooks.

- Scan consumers: landing `site_settings` keys, blogs (image_url + content URLs), `landing_sections` JSONB, `product_images`, `product_variants.image_url`, `categories.image_url`, `partners.logo_url`, partners page JSONB.
- Match by hosted_url and (when present) media_asset_id.
- Exclude `order_items.image_url`.
- API: `GET /api/media/assets/[id]/usage` returns attachment list.
- Update `last_used_at` when consumers save with Asset id or URL (start with product save + landing slot save + blog save hooks).
- Media grid: used/unused badge, last used relative time; filter used/unused.
- Unit tests with fixture DB rows: detects references; excludes orders; last_used update.

## Acceptance criteria

- [ ] Used Asset shows attachment locations in detail sheet.
- [ ] Unused Asset shows unused badge; filter works.
- [ ] last_used_at updates when product image attached via picker (after slice 11) or landing slot saved.
- [ ] Usage resolver tests pass for URL and id matching.

## Blocked by

- Slice 03 — Asset registry (`03-asset-registry-crud-backfill.md`)
