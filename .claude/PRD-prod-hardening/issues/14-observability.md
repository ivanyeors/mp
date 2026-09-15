# 14: Observability: Sentry, error pages on every route, disputes and webhook failures reach a human

**Type:** HITL. Provisioning Sentry through the Vercel Marketplace needs the account owner.
**Blocked by:** none
**User stories:** 40, 41, 42
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

The next silent outage (like the cron one in slice 01) is noticed within hours, and a customer who hits an error sees a page, not a framework default.

## The gap, precisely

- **No error tracker:** no Sentry or equivalent and no `instrumentation.ts`. Only `@vercel/speed-insights` is installed.
- **Error pages:**
  - None at `app/error.tsx`, `app/global-error.tsx` or `app/[lang]/error.tsx`.
  - Only `app/[lang]/settings/error.tsx` and `app/[lang]/shop/error.tsx` exist.
  - mp-config, results, blog, account and partner routes fall back to Next's default page.
- **Disputes:** `app/api/stripe/webhook/route.ts:672` sends disputes only to `console.error` (`// TODO: wire to a real alert channel`).
- **Webhook failures:** `recordWebhookFailure` writes `stripe_webhook_failures`, and nobody is notified. The `idx_stripe_webhook_failures_unresolved` index has never been used (Supabase advisor), which suggests nobody reads the table.
- **The notification channel already exists:** `app/api/results/hold/route.ts:80,201` posts to the Staff Telegram chat.

## Scope

1. **HITL:** provision Sentry from the Vercel Marketplace (the `marketplace` skill), linked to project `mp-inv`, so its env vars are injected.
2. **Wire Sentry:**
   - `@sentry/nextjs` with `instrumentation.ts` (server and edge) and `instrumentation-client.ts`
   - `onRequestError` exported
   - source maps uploaded on build
   - `tracesSampleRate` low (0.1)
   - Scrub request bodies on `/api/shop/checkout`, `/api/results/*` and `/api/partner/payment-details`.
3. **Error pages:** add `app/[lang]/error.tsx`, a localized "something went wrong" with a retry and a home link, reusing the shop error page's markup, and `app/global-error.tsx`.
4. **Alerts:**
   - Extract the Telegram send in `results/hold` into one `notifyStaff(text)` helper and reuse it for `charge.dispute.created` (amount, Order number, due-by date) and for `recordWebhookFailure`, throttled to one message per event type per hour.
   - Move the hardcoded chat id to an env var with the current value as the fallback.

## Acceptance criteria

- [ ] A deliberate test error thrown from a preview route appears in Sentry with a readable stack trace.
- [ ] Visiting a route that throws under `[lang]` renders the custom error page.
- [ ] vitest: `charge.dispute.created` calls `notifyStaff` once with the Order number and due date.
- [ ] vitest: the `recordWebhookFailure` path calls `notifyStaff`, and a second failure of the same type within an hour doesn't.
- [ ] The bundle budget (`pnpm bundle:check`) passes. If Sentry's client bundle exceeds it, adjust the budget pattern by hand; never run `--update`.
