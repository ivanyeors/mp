# 01: Ops: set `CRON_SECRET` and `SHOPIFY_SYNC_TOKEN` in prod, then check what the dead crons missed

**Type:** HITL
**Blocked by:** none. **Do this today.**
**User stories:** 1, 3
**Labels:** `bug`, `needs-triage`, `P0`, `area:admin`

## Goal

Two missing env vars leave one door open and one job queue dead. Setting them needs no code and nothing breaks.

## The gap, precisely

**Crons**
- `vercel env ls production` has no `CRON_SECRET`.
- Each cron guard refuses in production when the secret is unset (`app/api/cron/appointment-reminders/route.ts:26-34`, `app/api/cron/results-sla/route.ts:28-36`, and the same pattern in the other three cron routes).
- As a result, both `vercel.json` crons have been returning 401 every day:
  - `appointment-reminders` at 01:00 UTC
  - `results-sla` at 02:00 UTC. It also chains the **Shopify order mirror** catch-up and the **Pre-order** restock notices.

**Shopify**
- `SHOPIFY_SYNC_TOKEN` is also absent, while `SHOPIFY_ADMIN_ACCESS_TOKEN` is set.
- `app/api/shopify/sync`, `catalog/sync` and `mapping/apply` only check the token `if (env.syncToken)`, so today anyone can POST to them.
- Nothing in `app/` or `components/` calls these routes (verified by grep), so setting the token breaks no UI.

## Scope

1. **Generate two secrets** with `openssl rand -hex 32`.
2. **Add them to the environments:**
   - `vercel env add CRON_SECRET production`, then again for `preview`
   - `vercel env add SHOPIFY_SYNC_TOKEN production`, then again for `preview`
   - Store both in the team password manager.
3. **Redeploy prod.** Env changes only apply to new deployments.
4. **Verify against the running deployment, not `vercel env pull`.** Pull blanks Sensitive vars; see the partner-hub memory.
5. **Reconcile what the dead crons skipped** (read-only queries first):
   - `mp_config_responses` with status `held` and `created_at` older than 6 days. On 2026-09-15 there were 0.
   - `appointment_reminders` whose send time has passed without a send. Decide whether to send late or skip.
   - Pre-order restock notices that are owed.
   - Shopify orders not yet mirrored. The catch-up is safe to run by hand: `POST /api/cron/shopify-order-mirror-catchup` with the bearer token.

## Acceptance criteria

- [ ] `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CRON_SECRET" https://custom.mpillow.com/api/cron/appointment-reminders` returns `200`.
- [ ] The same request with no header returns `401`.
- [ ] The next scheduled run of both crons shows 200 in Vercel logs.
- [ ] `curl -X POST https://custom.mpillow.com/api/shopify/sync` with no token returns `401`.
- [ ] Reconciliation findings are written as a comment on this issue: counts, plus what was sent late or skipped.

## Notes

- **Slice 02 makes these routes fail closed in code**, so this can't regress when someone forgets the env var in a new environment. Until 02 ships, removing the env var reopens the Shopify routes.
- **Slice 14 (Sentry)** is what would have caught this outage in hours instead of weeks.
