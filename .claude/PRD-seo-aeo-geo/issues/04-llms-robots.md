# Slice 04 — llms.txt curated index + robots disallow cleanup

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 5, 13, 14, 15, 21, 22

## What to build

- Rewrite `app/llms.txt/route.ts` to use `buildLlmsIndex()` curated format
- Remove mp-config and mbolster-config from robots disallow; keep mp-basic disallowed
- Add account/cart noindex via metadata (separate from robots)
- robots.ts uses `getSiteOrigin()`; document llms.txt in comments

## Acceptance criteria

- [x] `/llms.txt` response < 10KB with brand, taxonomy, key URLs, target queries
- [x] No full blog bodies in llms.txt
- [x] mp-config and mbolster-config allowed in robots.txt
- [x] mp-basic still disallowed
- [x] `llms-index` test passes

## Blocked by

Slice 01
