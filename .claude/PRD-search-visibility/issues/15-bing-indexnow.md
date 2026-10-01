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
- [x] IndexNow pings on blog publish / update / unpublish via `after()`; failures logged, never blocking (tested)

## Blocked by

None

## Implementation notes

- The key file is served at `/indexnow-key.txt` (`app/indexnow-key.txt/route.ts`) and passed as `keyLocation`. Its root position covers every URL on the host.
- Pings only fire when `VERCEL_ENV=production` and only for URLs on the canonical host.
- Hooked into `POST /api/blogs`, `PATCH /api/blogs/[id]` and `updateBlogStatus`. Product pages are not hooked yet. Storefront products are a projection of inventory and change through the inventory sync, so add a ping there if product freshness in Bing matters.
- OPS: set `INDEXNOW_KEY` in Vercel Production. In Bing Webmaster Tools, import the property from GSC and submit `https://custom.mpillow.com/sitemap.xml`.
