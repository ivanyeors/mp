# Easyship settings sync — PRD

**Status:** built 2026-10-03 on `main` (unmerged until reviewed). No schema change.

## Problem

Easyship account configuration (tracking branding, default addresses, custom boxes, shipping
rules, webhook) lived only in the Easyship dashboard. Staff had no record of it, agents could not
change it, and the registered webhook pointed at a URL that did not exist.

## Decision

The platform is the source of truth (ADR 0020). Staff edit on `/settings/integrations/easyship`;
every save pushes to Easyship and stores a per-step report. Agents use the same endpoint with a
bearer token (`.claude/skills/easyship/SKILL.md`).

## Scope (v1, all built)

| # | Slice | Where |
|---|---|---|
| 01 | Shared schema, condition/action spec, import-from-live | `lib/easyship/schema.ts` |
| 02 | API client + paginator, config store in `api_configs` | `lib/easyship/client.ts`, `store.ts` |
| 03 | Reconciler: tracking, addresses, boxes, rules, webhook | `lib/easyship/sync.ts` (+ `sync.test.ts`) |
| 04 | Settings endpoint (GET/PUT/POST) + reference ids, bearer-or-admin guard | `app/api/settings/easyship/**`, `lib/auth/bearer-or-admin.ts` |
| 05 | Settings page + shipping-rules editor, nav entry | `app/[lang]/settings/integrations/easyship/**` |
| 06 | Webhook receiver: PR #219 owns `app/api/shipping/easyship/webhook/route.ts` (`lib/shipping/easyship-webhook`); this PRD only adds the sync-captured secret as its fallback (+ test) |
| 07 | Agent skill | `.claude/skills/easyship/SKILL.md` |
| 08 | **HITL** — prod env (`EASYSHIP_API_TOKEN`, `EASYSHIP_SYNC_TOKEN`), first import + save in prod, test webhook from the Easyship dashboard | — |

## Out of scope

Shipment creation / rate quoting through Easyship, product catalog sync, LYOC courier accounts,
auto-recharge, deactivating stray addresses.
