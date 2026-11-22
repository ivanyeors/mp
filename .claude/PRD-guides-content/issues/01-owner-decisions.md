# Slice 01 — Record the decisions: glossary and consolidation map

Type: AFK (docs only)
Parent: PRD `guides-content`
Triage: ready

D1–D6 were answered by the owner on 22 Nov 2026 (PRD table). This slice writes the consequences into the shared docs, so other sessions stop building against the old map.

## What to build

- `CONTEXT.md`:
  - **Editorial hub**: the one page per topic; content in `data/guides/*.md`; byline, "About this guide", updated date and sources; the blog's matching hub is merged into it.
  - **Page FAQ**: guide FAQs live in the guide's Markdown, not the Page FAQ store.
  - **Guide reviewer** (new term): an AHPC-registered physiotherapist who checks a guide's health facts, credited only in "About this guide" with their relationship declared (AHPC 5.7.2). Not an endorsement. _Avoid_: "recommended by", "approved by", a reviewer's name or photo in ads or next to a product.
- `.claude/PRD-search-visibility/content-audit.md`: three rows change from "Keep: hub" to "Merge → `/guides/<topic>`", with a dated note citing D1. The 27 posts merged into those hubs now go to the guides too.

(Persona and copy rules for D2 move to slice 00, where their check lives.)

## Acceptance criteria

- [x] Each of D1–D6 has an answer and a date in the PRD table.
- [ ] `grep -n '^\*\*Guide reviewer' CONTEXT.md` finds the new term; `grep -n 'Editorial hub' CONTEXT.md` shows the new definition.
- [ ] `content-audit.md` shows the three hub rows as merged, dated 22 Nov 2026.

## Blocked by

None
