# Slice 06 — Immediate re-resolve on mapping + Costings save

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 12–14, 28, 39

## What to build

Seamless graduation of **Others** / gap lines when Staff fixes data — no manual button, cron unchanged.

- `reResolveShopifyLineCosts({ variantIds? })`: for implicated lines, re-run mapping + **Costings** rollup; clear **Others** when resolved; fill previously missing costs.
- Do **not** arbitrarily rewrite healthy frozen costs on unrelated lines when Costings changes globally — only gap/Others lines and lines for variants affected by the save.
- Hook after `shopify_variant_mappings` upsert/delete (inventory actions + mapping API routes).
- Hook after Costings save path.
- Tests: Others line graduates after mapping+cost; unrelated frozen line unchanged.

## Acceptance criteria

- [x] Saving a mapping that covers an Others line clears Others and sets COGS without waiting for cron.
- [x] Saving Costings that supplies missing cost for a mapped gap line re-resolves immediately.
- [x] No new Staff “Re-resolve” control on Analytics.
- [x] Catch-up/cron behavior unchanged (still backfill/reconcile only).
- [x] Automated tests cover graduation vs freeze preservation.

## Status

Done.
