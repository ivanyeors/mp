# Slice 01 — Domain glossary: Landing section, Section draft, Publish, Publish snapshot, Preview mode

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: needs-triage
User stories covered: 1–3

## What to build

Add the five nouns this PRD introduces to `CONTEXT.md` so every later slice uses one name each.
The landing page builder currently has no glossary entry at all, even though `CONTEXT.md`
already references "page builder" in passing under **Media Asset**, **FAQ surface** and the
slide-in architecture note.

Place the entries in the `## Marketing` section, beside **Product Builder** — Page Builder is
the sibling Landing Site surface, and the existing **Product Builder** entry already carries
the "do not put this under Inventory Configure" style of guidance these need.

Each entry follows the file's existing shape: bolded term, definition prose with other terms
bolded and tables/routes in backticks, then an `_Avoid_:` line naming the collisions.

The collisions that matter:
- **Publish** already means two other things in this codebase — publishing a **Rule graph**
  version, and publishing a **Sellable item** to the storefront. The landing meaning needs to
  be marked as distinct from both, and from **Promote** (fillings).
- **Preview mode** must be distinguished from the customisation *preview* (Your Custom
  Mpillow), which is an established surface, and from the retired "Preview" link that opened
  the live site.
- **Section** is already taken by pillow fillings (`left | center | right`). The landing noun
  must be **Landing section**, never bare "Section".

Also add a `## Flagged ambiguities` line recording the resolution that landing drafts live as
nullable columns on `landing_sections` rather than a separate draft table, with the reason
(per-row concurrency), so slice 05 does not relitigate it.

Demoable outcome: a reader who knows nothing about this PRD can read `CONTEXT.md` and use the
five terms correctly, and can tell landing **Publish** apart from **Rule graph** publish.

## Acceptance criteria

- [ ] `CONTEXT.md` defines **Landing section**, **Section draft**, **Publish**, **Publish snapshot** and **Preview mode**, each with an `_Avoid_:` line.
- [ ] **Landing section** states that the noun is never bare "Section" (which is the pillow filling compartment) and names `landing_sections` as its store.
- [ ] **Publish** distinguishes the landing meaning from **Rule graph** publish, from storefront publishing of a **Sellable item**, and from **Promote**.
- [ ] **Preview mode** distinguishes it from the customisation preview and states that it renders the real landing route rather than a second renderer.
- [ ] **Section draft** states that a draft is per-**Landing section** and invisible to shoppers until **Publish**.
- [ ] **Publish snapshot** states it is append-only, bounded by retention, and never read by the render path.
- [ ] A `## Flagged ambiguities` entry records the draft-storage resolution and its reason.
- [ ] No term is introduced that an existing `CONTEXT.md` entry already covers.

Proof: `npx tsx --env-file=.env.local lib/landing-sections/glossary.check.ts` → `landing-glossary self-check ok`

## Blocked by

None - can start immediately
