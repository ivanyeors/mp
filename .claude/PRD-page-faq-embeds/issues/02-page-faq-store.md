# Slice 02 — Page FAQ store: schema, surface_key, CRUD helpers, bilingual seed, self-check

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 33–37, 39

## What to build

End-to-end data layer for Page FAQs (no public UI yet):

- Migration: `faq_page_sets` (unique `surface_key`, optional title labels JSONB, `visible`) and `faq_page_items` (`set_id`, `slug`, bilingual `content` JSONB, `position`, `visible`).
- Deep module **Page FAQ store**: parse/validate `surface_key`; get set + items by surface + locale; admin CRUD/reorder helpers; lazy seed-when-empty.
- Bilingual seed defaults for `home`, `mp-config`, `mbolster-config`, and main shop PDPs (resolve product IDs the same way other seeds do, or seed by stable slug mapping documented in the module).
- Runnable self-check: surface_key accept/reject, seed bilingual completeness, no duplicate slugs per set, schema text stripping via existing Global FAQ helper where applicable.

Demoable outcome: migration applies; seed populates sets; self-check passes; Global FAQ tables untouched.

## Acceptance criteria

- [ ] Migration creates `faq_page_sets` / `faq_page_items` with unique `surface_key`.
- [ ] `surface_key` validation accepts only `home` | `mp-config` | `mbolster-config` | `product:{uuid}`.
- [ ] `getPageFaq(surface, locale)` returns visible items in position order (or empty).
- [ ] Lazy seed-when-empty creates bilingual starter items for agreed surfaces.
- [ ] Self-check fails if seed missing en-US/zh-CN or duplicate slugs.
- [ ] Global `faq_categories` / `faq_items` behavior unchanged.

## Blocked by

- Slice 01 (domain glossary)
