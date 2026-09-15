# 10: Move to Vercel Pro and add Firewall rate-limit rules on the endpoints that spend money

**Type:** HITL. A purchase and dashboard configuration.
**Blocked by:** none
**User stories:** 28, 29
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`

## Goal

Prod runs on a plan that allows commercial use, and no single IP can flood the endpoints that cost money or send messages.

## The gap, precisely

**Plan**
- The Vercel team `ivanyeors-projects` is on **Hobby** (checked 2026-09-15). Hobby is for personal, non-commercial use, and this project takes Stripe payments, so it can be paused.
- Hobby limits crons to 2, which is why `results-sla` chains the Shopify mirror catch-up and Pre-order restock (`app/api/cron/results-sla/route.ts:273-295`).

**Rate limiting.** The only limiter is `lib/rate-limit.ts`, an in-memory `Map` per instance. Its own `ponytail:` note says it dampens rather than stops. Only `support/contact` and `mp-config/responses` use it.

**Unprotected endpoints**

| Path | Why it matters |
|---|---|
| `POST /api/appointments/book` | Google Calendar invite to any email (`sendUpdates=all`), paid WhatsApp template to any number, Google contact write |
| `POST /api/results/hold` | Telegram to the Staff chat and email to any address before the card is authorised |
| `POST /api/shop/checkout` | an Order row, Stripe coupon and Stripe customer on every call |
| `POST /api/shop/coupons/validate` | coupon probing |
| `POST /api/analytics/ingest` | up to 50 events per request of DB writes |

`place-id` is deleted in slice 07, not rate-limited.

## Scope

1. **Upgrade** the team to Pro. Owner action.
2. **Vercel Firewall, custom rules, rate limit by IP.** Suggested starting limits; tune them after a week of logs:
   - `/api/appointments/book`: 5 per 10 min
   - `/api/results/hold`: 10 per min
   - `/api/shop/checkout`: 10 per min
   - `/api/shop/coupons/validate`: 10 per min
   - `/api/analytics/ingest`: 60 per min
   - Action: deny with 429.
3. **Turn on** the Firewall's bot protection managed ruleset if the plan includes it.
4. **Optional follow-up issue:** now that Pro allows more crons, split the chained jobs out of `results-sla` into their own `vercel.json` crons.

## Acceptance criteria

- [ ] Team plan shows Pro.
- [ ] 5 Firewall rules exist and are active on production.
- [ ] Probe from one IP: the 6th `POST /api/appointments/book` inside 10 min returns 429. Use an invalid body so earlier calls 400 without side effects.
- [ ] Probe: the 11th checkout POST inside a minute returns 429.
- [ ] Rule definitions are pasted as a comment on this issue so they can be recreated.
