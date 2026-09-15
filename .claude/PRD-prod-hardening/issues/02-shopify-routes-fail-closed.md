# 02: Lock the Shopify admin routes: fail closed, Staff session or token, constant-time compare

**Type:** AFK
**Blocked by:** none
**User stories:** 2, 3, 4
**Labels:** `bug`, `needs-triage`, `P0`, `area:admin`

## Goal

Make every secret-gated route refuse when its secret is missing, and put the six Shopify admin routes behind a Staff session or the sync token.

## The gap, precisely

**Token checked only when configured**

| Route | Method | Today |
|---|---|---|
| `app/api/shopify/sync/route.ts:15-20` | POST | `if (env.syncToken) { … token !== env.syncToken … }` |
| `app/api/shopify/catalog/sync/route.ts:21-25` | POST | same |
| `app/api/shopify/mapping/apply/route.ts:19-23` | POST | same, then a service-role upsert into `shopify_variant_mappings` with no validation (just an `as` cast) |

**No auth at all**

| Route | Method | What it does |
|---|---|---|
| `app/api/shopify/variants/route.ts:6` | GET | lists every Shopify product and SKU with the admin token |
| `app/api/shopify/diagnostics/route.ts:10` | GET | service-role; leaks shop domain, location id and buildable counts |
| `app/api/shopify/mapping/suggest/route.ts:102` | GET | same kind of catalog read |

`lib/shopify/env.ts:23` treats `SHOPIFY_SYNC_TOKEN` as optional.

**Secrets compared with `===` (not constant-time)**
- the 5 cron routes' `authorizeCron`
- the Telegram webhook secret (`app/api/telegram/webhook/route.ts:628`, also optional via `if (secret)`)
- the WhatsApp verify token (`lib/appointments/whatsapp.ts:231`)

Constant-time compares already exist inline in `lib/shopify/verify.ts:11`, `lib/appointments/whatsapp.ts:251` and `lib/partner-backup-email.ts:51`.

## Scope

- **One shared helper** `secretMatches(expected: string | undefined, got: string | null): boolean`.
  - Returns false when `expected` is empty, then compares with `timingSafeEqual` over equal-length buffers.
  - Use it in the cron guards, the Shopify sync token, the Telegram secret and the WhatsApp verify token.
- **Cron guards:** keep today's dev-only open behaviour (`NODE_ENV !== "production"`), but route the compare through the helper.
- **The three Shopify POST routes** authorise when either:
  - the bearer token matches the helper, **or**
  - `requireAdmin("inventory")` (`lib/auth/admin.ts`) passes.
- **The three Shopify GET routes:** `requireAdmin("inventory")`.
- **`mapping/apply`:** validate the body with zod before the upsert.
- **Telegram webhook:** refuse when `TELEGRAM_WEBHOOK_SECRET` is unset in production. Stop the GET from reporting which env vars are configured.

## Acceptance criteria

- [ ] Each of the 3 POST routes returns 401 with no token and no session, **even when `SHOPIFY_SYNC_TOKEN` is unset**.
- [ ] Each POST returns 200 or its normal result with a valid token, and with an `inventory` Staff session.
- [ ] Each of the 3 GET routes returns 401 or 403 without a Staff session.
- [ ] `mapping/apply` returns 400 for a malformed body.
- [ ] Telegram POST without a valid secret returns 401 in production mode.
- [ ] vitest: `secretMatches` returns false for undefined, empty, different-length and wrong values, and true for an exact match.
- [ ] vitest: a Shopify sync route test proves that unset env plus no auth returns 401. This fails on today's code.
