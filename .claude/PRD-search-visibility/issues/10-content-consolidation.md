# Slice 10 — Execute consolidation — merges, 301s, prunes, E-E-A-T

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 25, 26, 27

## What to build

- Rewrite each canonical target, folding the best sections of merged posts into it; answer lede; question-style H2s; named author/reviewer; updated date; first-hand photos; cited sources
- 301 merged slugs to their targets (`next.config.ts` redirects or a blog redirect map), for every locale
- Pruned posts: 410, or `noindex` where they still serve users
- Update the sitemap, llms.txt, internal links and `/guides/` hubs to point at the targets
- Add `seo_annotations` entries for each batch

## Acceptance criteria

- [ ] No internal link points at a redirected slug
- [ ] Sitemap contains only canonical targets
- [ ] `curl -I` on each merged slug returns a permanent redirect
- [ ] GSC clicks for each merge group tracked on the watchlist for 8 weeks

## Blocked by

Slice 09
