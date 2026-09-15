# 17: Sign-off: prove every hole is closed in prod

**Type:** HITL
**Blocked by:** 01–16 (#167–#182)
**User stories:** 48
**Labels:** `enhancement`, `needs-triage`, `P0`, `area:admin`

## Why this can't be AFK

Tests prove the code. Only prod proves the env vars, Firewall rules, BotID, headers, Stripe endpoint subscriptions and applied migrations. Several of those are dashboard state that no test can see.

## Checklist (run against `https://custom.mpillow.com` unless noted)

**Secrets and crons (01, 02)**
- [ ] Both crons show 200 in Vercel logs for two consecutive days.
- [ ] `POST /api/shopify/sync` with no token returns 401. `GET /api/shopify/variants` returns 401 or 403.

**Money (03, 04, 06, 08, 09).** Use the Stripe **sandbox** on a preview, not live.
- [ ] Coupon `%` returns invalid.
- [ ] A customised pillow posted with an accessory variant returns 400.
- [ ] Double-clicking accept on a test Result creates one Order.
- [ ] `stripe events resend` on a completed checkout produces no second email and no second stock row.
- [ ] Country mismatch returns 400.

**Customers (05, 12, 13)**
- [ ] Hold with someone else's `responseId` returns 403.
- [ ] `/account/login?next=/%5Cevil.com` lands on-site.
- [ ] `curl -sI /` shows HSTS, `X-Frame-Options`, nosniff, Referrer-Policy and Permissions-Policy, and no `X-Powered-By`.
- [ ] Changing another cart's item returns 404.

**Surface (07, 10, 11)**
- [ ] `place-id`, `mp-maker/configs` and `stripe-test` return 404.
- [ ] Anonymous `GET /api/shop/products` returns 401 or 403.
- [ ] The 6th booking POST in 10 min returns 429.
- [ ] A booking with an off-grid time returns 400.
- [ ] `curl` checkout with no BotID headers returns 403.
- [ ] A real phone completes a booking and a Stripe checkout.

**Visibility and DB (14, 15, 16)**
- [ ] A test error appears in Sentry.
- [ ] A test dispute (sandbox) posts to the Staff Telegram chat.
- [ ] `get_advisors` security and performance show no WARN.
- [ ] Vercel `get_runtime_errors` for the last 7 days shows nothing new from these routes.
- [ ] A Reference photo loads through a signed URL.

## Done when

Every box is ticked, and the outcomes are posted as a comment on the PRD issue.
