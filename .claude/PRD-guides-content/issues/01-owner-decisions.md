# Slice 01 — Owner decisions D1–D6 and glossary

Type: HITL
Parent: PRD `guides-content` (`.claude/PRD-guides-content/guides-content-prd.md`)
Triage: needs-triage

## What to build

- Owner answers D1–D6 in the PRD (blog hub merge, claim wording, clinical reviewer, media budget, ads, zh-CN).
- Update `CONTEXT.md`:
  - **Editorial hub**: the one page per topic; content in `data/guides/*.md`; byline and dates.
  - **Page FAQ**: guide FAQs live in the guide's Markdown, not the Page FAQ store.
- If D1 = merge: amend `.claude/PRD-search-visibility/content-audit.md` (three hubs become merged into guides).
- If D2 changes wording: update rule 2 in `docs/marketing-page/persona.md` and `.claude/rules/storefront-copy.md`.

## Acceptance criteria

- [ ] Each of D1–D6 has an answer and a date in the PRD table.
- [ ] Glossary entries updated; `grep -n 'Editorial hub' CONTEXT.md` shows the new definition.

## Blocked by

None
