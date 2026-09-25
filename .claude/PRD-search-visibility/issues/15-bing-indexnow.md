# Slice 15 — Bing Webmaster Tools + IndexNow

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 37

## What to build

- OPS: verify `custom.mpillow.com` in Bing Webmaster Tools (import from GSC); submit the sitemap
- AFK: serve `/{INDEXNOW_KEY}.txt`; ping IndexNow when a blog post, guide or storefront product is published or updated (from existing save actions)

## Acceptance criteria

- [ ] Bing shows the sitemap as processed
- [ ] IndexNow ping returns 200/202 on publish; failures are logged, never blocking

## Blocked by

None
