# Slice 17 — Blog hygiene quick wins

Type: AFK (+ HITL copy review)
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 26, 27

Fixes that are wrong under any consolidation outcome. They can ship before the audit (09), so they do not need to wait for the before-line.

## What to build

- Unpublish or fix `which-mpillow-configuration-is-for-you`, which has "[image here]" and "xxx cm" placeholders
- Fix the broken slug `p-how-a-tailored-pillow-…-p-p-p` with a 301 to a clean slug
- Repair mojibake (`â€™` → `'`, etc.) across all post bodies in the DB
- Correct factual errors found in the audit (e.g. the Plato misattribution); remove unsourced statistics or add a source
- `dateModified`: add an explicit `content_updated_at` set only on editorial saves, so a bulk sync no longer makes every post look updated; show "Updated {date}" on the page when it differs from the published date
- Authors: replace `Person: "Mpillow"` with a real author entity (name, role, `/about` or author page URL, `sameAs`); use `Organization` when no person is named
- Hero `alt`: describe the image, not the title
- Backfill empty `description` for all posts (HITL copy review), because they drive the meta description and the answer lede fallback

## Acceptance criteria

- [ ] No published post contains `[image here]`, `xxx cm` or `â€`
- [ ] Every published post has a non-empty description
- [ ] Article JSON-LD `dateModified` changes only on editorial saves (test)
- [ ] Author JSON-LD has a URL; there is no `Person` named "Mpillow"

## Blocked by

None
