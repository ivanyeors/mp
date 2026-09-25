# Slice 09 — Blog content audit + consolidation map

Type: HITL
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 23, 24, 28

## What to build

- Run against `blog_posts` in the DB, not `data/blogs/*.mdx`: only 10 MDX bodies were synced back, so the two may differ
- Start from the baseline groups in the PRD (**Content audit baseline**: ~55 posts in 6 intent groups + 4 exact duplicate pairs)
- Script joining every blog slug to 16 months of GSC page data (clicks, impressions, top queries, position) and an internal quality score (word count, answer lede, author, first-hand media, internal links)
- Cluster posts by intent using shared top queries (≥50% query overlap = cannibalising)
- Output `content-audit.md` in this folder: each slug → keep / merge into X / refresh / prune, with evidence. Expected shape: ~8 canonical targets, ~15–20 prunes
- Marketing reviews and approves the map (HITL)
- Write a content brief standard: every new or refreshed page needs one unique asset (our data, our fitting process, reviews, staff expertise)

## Acceptance criteria

- [ ] Every blog slug has a decision and evidence row
- [ ] Merge groups named with a single canonical target each
- [ ] Map approved by marketing before slice 10 starts

## Blocked by

Slice 01
