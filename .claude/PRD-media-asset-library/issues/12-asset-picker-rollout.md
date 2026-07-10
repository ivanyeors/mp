# Slice 12 — Roll Asset picker to blogs, categories, partners, page builder

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 20
Modules: 6, 9

## What to build

Roll **Asset picker** to remaining admin consumers currently using ImagePicker:

- Blog hero image editor
- Categories manager
- Partners page (hero + logos)
- Page builder section editor `ImageField`

Each save path dual-writes Asset id where schema allows (nullable column or settings JSON) + url. Usage hooks fire on save.

## Acceptance criteria

- [ ] All four surfaces use Asset picker instead of legacy ImagePicker for new selections.
- [ ] Existing url-only references still work and appear in usage resolver.
- [ ] No regression in blog/category/partner/page-builder save flows.

## Blocked by

- Slice 11 — Asset picker products (`11-asset-picker-products.md`)
