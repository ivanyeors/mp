# Slice 04 — Settings FAQ redesign: Global | Page FAQs tabs + admin APIs

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 22–27, 29, 33–34

## What to build

Redesign `/settings/faq` so operators manage both catalogs in one place:

- Top tabs: **Global FAQ** | **Page FAQs**.
- Global tab: preserve existing category/item edit, reorder, visibility, bilingual fields (polish layout to share chrome with Page FAQs).
- Page FAQs tab: surface picker (home, mp-config, mbolster-config, product list); ensure set exists; add/edit/reorder/show/hide/delete items; bilingual fields; empty state; preview link to the public URL for that surface.
- Admin APIs for Page FAQ sets/items (CRUD + reorder), same auth/permission model as Global FAQ admin.
- Creating/selecting a product surface uses `product:{id}` and can create an empty set on demand.

Demoable outcome: operator edits a Page FAQ item in Settings and sees it persisted; Global FAQ still editable; unauthorized users blocked.

## Acceptance criteria

- [x] Settings FAQ shows Global | Page FAQs tabs with coherent redesigned chrome.
- [x] Global FAQ create/edit/reorder/visibility still works.
- [x] Page FAQs: pick surface → edit bilingual items → reorder → toggle visibility → delete.
- [x] Product surface can be selected and gets a set if missing.
- [x] Empty state + preview link for selected surface.
- [x] Admin APIs require existing FAQ/page-builder permission; public cannot mutate.
- [x] Changes reflect in Page FAQ store reads used by slice 03+.

Proof: `npx tsx --env-file=.env.local components/settings/settings-faq.check.ts` → `settings-faq self-check ok`

## Blocked by

- Slice 02 (Page FAQ store)
