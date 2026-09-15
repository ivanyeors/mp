# PRD: Prod hardening

**Status:** specified, not started
**Tracker:** #166. Slices are in `issues/` (01–17), numbered #167–#183.
**Environment:** prod = `custom.mpillow.com` on Vercel (team `ivanyeors-projects`, **Hobby** plan) with Supabase `irgxjthamhiaolvdfgar`.
**Audited:** 2026-09-15 against `main` @ `7ad72233`.

## Problem Statement

The shop takes real money through Stripe: Orders, **Authorization holds** on **Results**, and **Balance payments**. It sends messages that cost money or reach real people: Google Calendar invites, WhatsApp templates, email and Telegram. It also pushes stock and prices to a live Shopify store.

Every one of those actions sits behind a public HTTP endpoint. An audit of every route handler, server action, webhook, RLS policy and prod env var found several ways to break things:
- **Exploits:** an anonymous visitor or a bot can change what gets charged, take over another customer's Result, rewrite the live Shopify catalog, or turn the booking form into a spam relay.
- **Silent failures in prod:** some jobs aren't running at all, and nothing reports it.

From the business's side, the problems are:
- Money can be lost without anyone noticing: builds bought at an accessory's price, hidden coupons, GST avoided, double orders, and webhook events acknowledged but never processed.
- Customer trust can break: a Result hijacked or deleted, and spam invites sent from the shop's own calendar.
- Operations fail silently: no Appointment reminders, no SLA handling of Authorization holds before Stripe's 7-day expiry, and no error tracker to report any of it.

## What the audit found

**Method**
- Three parallel code audits:
  - authorization on every entry point
  - money paths, webhooks and bot abuse
  - RLS, secrets, headers and XSS
- Live read-only checks:
  - Supabase advisors, `pg_policies` and `admin_users`
  - Vercel prod env var names, 7-day runtime error groups and the team plan

Every finding below was confirmed in code; those marked *(prod)* were also confirmed against the live environment.

### Broken in prod right now
- **Every cron refuses to run** *(prod)*. `CRON_SECRET` isn't set in production, and the cron guard deliberately refuses in production when it is missing. The jobs that aren't running:
  - Appointment reminders
  - Results SLA handling
  - Shopify order mirror catch-up
  - Pre-order restock notices

  No Authorization hold is older than 6 days yet *(prod)*, so nothing has expired, but that won't last.
- **The Shopify admin routes are open to anyone** *(prod)*.
  - `SHOPIFY_SYNC_TOKEN` isn't set in prod, and the sync, catalog sync and mapping apply routes only check the token *if one is configured*.
  - The Shopify admin access token *is* set. So an anonymous POST can push prices and stock to the live Shopify store, create products, or remap variants.
  - Three GET routes (variants, diagnostics, mapping suggest) have no auth at all.
  - No UI calls any of these routes, so locking them breaks nothing.

### Money that can be taken
- **A customisation isn't bound to the Variant being bought.**
  - How checkout prices a customised line: the chosen Variant's price plus a stored delta. The delta is the Composed sellable's Costings subtotal minus that size and Tier's MSRP.
  - The client chooses the Variant and the customisation id separately, and checkout never checks they belong together.
  - So a pillow build can be paired with a cheap accessory Variant: the shopper pays the accessory price plus the delta, and a full build is queued.
- **Coupon codes are matched with a wildcard pattern.** `%` or a prefix like `STAFF%` finds and applies hidden coupons, and both public validators return the whole coupon row. No coupon is active today *(prod)*, so there is no live exposure yet, but there will be as soon as one is created.
- **The same unescaped pattern matching is used on emails** in four places. The worst is the Staff context fallback, which also never checks that the row it matched belongs to the signed-in user.
- **A double-clicked accept creates two Orders, two commissions and two stock deductions.** Every guard reads first and acts afterwards.
- **GST can be avoided** by typing a different country while choosing the Singapore shipping method. Only an SG tax rule exists.
- **Partners can refer themselves** and earn commission and milestone progress. Milestone bonuses are never reversed when an Order is refunded.
- **Add-on quantity accepts fractions**, so a quantity of 0.01 costs 1%.
- **Coupon usage limits can be exceeded** under concurrency: the cap is checked at checkout but only incremented after payment.

### Customers who can be harmed
- **Anyone who knows a Result's id can take it over.**
  - The hold endpoint re-submits an existing Result with no ownership check. It swaps the customer email and the Result access token, and clears the payment intent.
  - A retry within 24h reuses the Stripe idempotency key with different parameters (the success URL holds a new token each time). The error path then **deletes** the Result.
- **Cart items can be edited or deleted by id** without owning the cart.
- **Login has an open redirect**: a `next` path starting with a backslash gets past the same-origin check.
- **Staff-written content can break out of the JSON-LD script tag** on public pages: JSON-LD is serialised without escaping `<`.
- **No security headers are set.** The Admin Panel can be framed (clickjacking), and there's no HSTS.

### Surfaces that cost money or send messages to anyone
- **Appointment booking** has no auth, rate limit or bot check. It only validates that start < end. Each request sends a Google Calendar invite to any email, a paid WhatsApp template to any number, and writes a Google contact. A single booking a year long blocks the whole calendar.
- **The Google place-id route** is an unauthenticated, billed Places proxy. Nothing in the app calls it.
- **Result hold** sends a Telegram message to the Staff chat and an email to any address *before* the card is authorised.
- **Checkout** creates an Order, Stripe coupons and a Stripe customer on every call.
- **Analytics ingest** is open.
- **The only rate limiter is in memory, per instance.** It dampens a flood rather than stopping one.
- **The Vercel team is on Hobby**, which is non-commercial only. That puts the project at risk of being paused, and Hobby has no Firewall rate-limit rules.

### Admin data served to the public
- **Product and blog GETs** return admin rows to anonymous callers: Variant `cost_price`, and draft and archived products and posts. Only the Admin Panel calls these GETs.
- **Dead endpoints still deployed:**
  - The storefront reviews route reads a `reviews` table that doesn't exist *(prod)*. The real table is `product_reviews`, with 0 rows *(prod)*. Its POST trusts a client-supplied customer and order id.
  - The mp-maker configs route does an unauthenticated service-role upsert, and nothing calls it.
  - The Stripe test page still ships to prod.
- **Staff authorization gaps:**
  - An `admin` can grant or remove the `owner` role.
  - Any Staff role, including `viewer`, can upload and delete Reference photos.
  - A partner logo URL is checked by path only, so a foreign host crashes `next/image` on public partner pages.

### Reliability
- **The Stripe webhook returns 200 on non-critical handler failures**, so Stripe never retries and the event is lost.
  - Order confirmation isn't an atomic claim, so concurrent deliveries double-send emails and double-count coupons.
  - Several money writes never check `error`, including stamping the hold's payment intent and the stock idempotency count.
  - Inventory deduction ignores insert errors.
  - `payment_intent.canceled` (an expired Authorization hold) isn't handled.
- **No error tracker and no `instrumentation.ts`.** Only the settings and shop routes have error pages. Disputes only reach `console.error`.
- **Supabase advisors report:**
  - 5 functions with a mutable `search_path`
  - `current_customer_id()`, a SECURITY DEFINER function, callable by anon
  - RLS initplan re-evaluation on customer policies
  - leaked password protection turned off
- **Low-priority items:**
  - The public shop search builds a PostgREST `.or()` filter from raw input.
  - About 93 responses return raw database error text.
  - Reference photos sit in the public `media` bucket.
  - Two lockfiles are committed.

### Already fine (no work)
- **Next.js and React:** Next 16.2.10 and React 19.2.7 already include the fixes for the middleware auth bypass and the RSC remote-code-execution advisories.
- **Webhook signatures:** Stripe signatures are verified on the raw body. Shopify and WhatsApp HMACs are compared with `timingSafeEqual` and fail closed.
- **Pricing:** shop and Result prices are computed on the server from Costings. Checkout sessions for top-ups check `result_id`.
- **Prod RLS** *(prod)*:
  - RLS is enabled on every table.
  - The old "Service role full access" policies are scoped to `service_role`.
  - `tmp_anon_read` has been dropped.
  - The public can only read catalog tables and `site_settings`.
  - There are no storage policies.
- **Staff accounts** *(prod)*: `admin_users` has exactly 3 active owners, all known.
- **Secrets:** no `NEXT_PUBLIC_*` secret, no hardcoded key in git history, and `.env*` is ignored.
- **Recent prod errors:** the `/shop` CartProvider and function-prop runtime errors were last seen before the fixes in #151 and #153.

## Solution

Close every path above without changing how an honest customer, Partner or Staff member uses the site.

**Hard rules**
- **Server state is the only authority.** The server works out the price a customer pays, who owns a Result, and whether a coupon applies. Nothing the client sends decides them.
- **Every side effect runs exactly once:** an Order, a commission, a stock deduction, an email.
- **Missing secrets fail closed.** Every secret-gated route refuses when its secret is missing.
- **Stripe must be able to retry.** The webhook reports failure honestly, and every handler step is idempotent so a retry is safe.

**Abuse protection:** the Vercel team moves to Pro. Firewall rate-limit rules cover the endpoints that spend money or send messages, and BotID covers the booking, Result hold and checkout forms.

**Visibility:** errors reach an error tracker, disputes reach a real alert channel, and the prod Supabase advisors come back clean.

## User Stories

1. As the business, I want prod crons to run every day, so that Appointment reminders go out and Authorization holds are handled before Stripe expires them.
2. As the business, I want every secret-gated route to refuse when its secret is missing, so that a forgotten env var locks a door instead of opening it.
3. As the business, I want the Shopify sync, catalog and mapping routes to require a token or a Staff session, so that no stranger can change live Shopify prices, stock or variant mappings.
4. As Staff with the `inventory` permission, I want to trigger a Shopify sync while signed in, so that I don't need to handle a raw token.
5. As the business, I want coupon codes matched exactly, so that nobody can discover or apply a hidden coupon by typing a wildcard.
6. As a shopper, I want the coupon check to tell me only whether my code works and what it takes off, so that the internal coupon setup isn't exposed.
7. As Staff, I want sign-in to match my Staff record by exact email and to refuse a record already bound to another account, so that nobody inherits my role through a similar-looking email.
8. As the business, I want checkout to price a customised line from the Composed sellable's Costings subtotal, so that the amount charged is always the build being made.
9. As the business, I want checkout to refuse a customisation paired with a Variant of a different product, so that a pillow build can't be bought at an accessory's price.
10. As the business, I want stock checked per Variant across all cart lines, so that splitting a quantity into repeated lines can't get past the stock check.
11. As a customer, I want nobody else to be able to re-submit my Result, so that my email, Result access token and Authorization hold can't be taken over.
12. As a customer, I want a retry of my own submit to never delete my Result, so that a network hiccup doesn't lose my customisation or strand my card hold.
13. As a customer, I want my submit to use a stable idempotency key, so that a legitimate retry returns the same Checkout Session.
14. As Staff, I want accepting a Result to create exactly one Order however many times the button is pressed, so that customers, stock and commission aren't doubled.
15. As the business, I want unused endpoints removed from prod, so that code nobody maintains can't be abused.
16. As a shopper, I want product reviews to show only approved reviews with public fields, so that pending reviews and customer ids aren't exposed.
17. As a shopper, I want to post a review only while signed in, with my identity taken from my session, so that reviews can't pretend to be verified purchases.
18. As the business, I want the product and blog list and detail GETs to require Staff, so that cost prices and drafts aren't public.
19. As the business, I want each Stripe webhook event to confirm an Order exactly once, so that duplicate deliveries don't double-send emails or double-count coupons.
20. As the business, I want the webhook to return an error when a step fails, so that Stripe retries instead of the event being lost.
21. As the business, I want every money write in the webhook to check its database error, so that a transient failure doesn't pass as success.
22. As Staff, I want an expired Authorization hold marked on its Result, so that accept stops retrying a capture that can never work.
23. As the business, I want inventory deduction to surface insert failures, so that oversold stock is flagged and not hidden.
24. As the business, I want the shipping country checked against the chosen shipping method, so that GST can't be avoided.
25. As the business, I want a Referral that resolves to the buyer's own Partner account refused, so that Partners can't earn commission or milestone progress on their own purchases.
26. As the business, I want Add-on quantities to be whole numbers within a sane cap, so that a fractional quantity can't discount a build.
27. As the business, I want the coupon usage limit enforced atomically in the database, so that parallel checkouts can't exceed it.
28. As the business, I want the Vercel team on a plan that allows commercial use, so that prod isn't paused under the Hobby terms.
29. As the business, I want per-IP rate limits on booking, Result hold, checkout, coupon validation and analytics ingest, so that one bot can't run up Google, WhatsApp or Stripe costs.
30. As the business, I want bot verification on the booking, Result hold and checkout forms, so that automated traffic is refused before any side effect.
31. As Staff, I want a booking accepted only for a future, on-grid slot within the maximum duration, so that one request can't block the calendar.
32. As the business, I want the unused place-id proxy removed, so that nobody can spend our Places quota.
33. As a customer, I want the post-login redirect to only ever land on this site, so that a crafted login link can't send me to a phishing page.
34. As a visitor, I want structured data in public pages safely escaped, so that content can't run scripts in my browser.
35. As Staff, I want the Admin Panel to refuse being framed and the site to send HSTS, nosniff, Referrer-Policy and Permissions-Policy, so that clickjacking and downgrade attacks don't work.
36. As an owner-role Staff member, I want only owners to grant or remove the owner role, so that an admin can't take over the account.
37. As the business, I want Reference photo upload and delete limited to Staff with the `results` permission, so that a viewer can't change customer evidence.
38. As a shopper, I want my cart items changeable only through my own cart, so that nobody can edit or empty my cart by id.
39. As a visitor, I want public partner pages to keep rendering whatever a Partner saves as a logo, so that one Partner can't take the page down.
40. As the business, I want runtime errors and failed webhooks reported to an error tracker, so that silent failures like the cron outage are caught within hours.
41. As a customer, I want a friendly error page on every public route, so that a server error doesn't dump me on a blank framework page.
42. As the business, I want disputes to alert a human, so that the response deadline isn't missed.
43. As the business, I want the Supabase security and performance advisors clean, so that database functions can't be hijacked through `search_path` and policies stay fast.
44. As a customer, I want sign-up to refuse known-leaked passwords, so that my account isn't taken over by credential stuffing.
45. As the business, I want the public shop search to escape its input, so that a crafted query can't inject filter terms or cause a 500.
46. As a customer, I want errors shown to me not to contain raw database messages, so that internal structure isn't revealed.
47. As a customer, I want my Reference photos served only through short-lived signed URLs, so that photos of me aren't public to anyone holding the link.
48. As the business, I want a recorded sign-off that each hole is closed in prod, so that the fixes are proven rather than assumed.

## Implementation Decisions

**Guards**
- **Missing secret = refuse.** Every route gated by an env secret denies the request when the secret is absent. Secrets and tokens are compared with a constant-time helper. Crons, Shopify sync and Telegram all route through one helper, not an inline `===`.
- **Shopify admin routes** accept either the sync token or a Staff session with the `inventory` permission, through the existing Staff guard. Read-only Shopify diagnostics need the same Staff permission.
- **Pattern-match lookups** (coupon code, email) use exact equality on normalised values or the existing escape-like-pattern helper. The Staff context never accepts an email-matched record whose auth user is already bound to someone else. Coupon validators return a narrow result (valid, discount, free shipping, error) and never the row.

**Checkout and Results**
- **Customised checkout pricing:**
  - Checkout recomputes the customised unit price on the server with the same composed-price function the customise route uses.
  - It refuses a customisation whose product doesn't match the Variant's product (pillow product, or bolster Variant).
  - The stored `total_addon_price` becomes a display snapshot only.
  - Stock is aggregated per Variant before comparing.
- **Result hold re-submit:**
  - An existing `responseId` requires the same Result access check the responses route uses (Result access token, or the signed-in owning customer).
  - The failure path deletes a row only if this request inserted it.
  - The Stripe idempotency key is derived from parameters that stay stable across retries.
- **Accept exactly once:** the first write is a conditional claim (update where `order_id` is null). Zero affected rows means someone else won, and the handler returns the existing outcome. This is the same pattern the finish route already uses.
- **Stripe webhook:**
  - Order confirmation is a conditional claim on `paid_at` is null, and every later side effect runs only for the claimer.
  - Any unhandled failure returns 5xx so Stripe retries.
  - Idempotency is the existing unique keys (ledger by Stripe object id, commissions by Order item, milestone bonus by Partner and tier) plus stock transactions keyed per Order item.
  - New handled event: `payment_intent.canceled`, which marks the Authorization hold expired.
  - `refund.updated` is **not** added here. It is owned by PayNow slice 02 (#143) and this PRD depends on it.

**Money rules**
- **Tax:** the country must be one of the chosen shipping method's countries, else 400. This applies to both checkout and Result hold.
- **Self-referral:** a Referral code resolving to the signed-in Partner account, or to a Partner whose login or backup email equals the buyer email, is ignored. It isn't an error, and attribution falls through to the normal self-purchase rules.
- **Add-on quantity:** a positive integer with an upper cap.
- **Coupon usage:** the usage-increment RPC becomes a conditional increment (only while under the limit) that reports whether it applied. This is a migration, applied with `supabase db push`.

**Abuse protection**
- **Rate limiting:** Vercel Pro Firewall rules keyed per IP on the five abusable paths (booking, Result hold, checkout, coupon validation, analytics ingest). The existing in-memory limiter stays as a second layer where it is already wired; no new store.
- **BotID:** the client script is installed on the booking, Result hold and checkout forms, with a server check before any side effect.
- **Booking validation:** the book route accepts a slot only if it is one the existing Appointment slot generator produces for that date, location and type. That covers future, grid-aligned, configured duration, availability windows and lookahead, and it reuses the same function the slots route already calls. No second set of rules.

**Removed or re-scoped routes**
- The place-id proxy, the mp-maker config routes and the Stripe test page (plus its test-checkout API) are deleted.
- The storefront reviews route is re-pointed to `product_reviews`:
  - public GET: approved only, public columns
  - POST: needs sign-in, identity comes from the session, order ownership is verified
- Product and blog GETs require the Staff permission their writes already require.

**Web hardening**
- **Security headers** are set once in the Next config for all routes: HSTS, `X-Frame-Options: DENY`, nosniff, a strict-origin Referrer-Policy and a minimal Permissions-Policy. The powered-by header is off. CSP is out of scope (see below).
- **Safe redirects:** the safe-next-path guard also rejects backslashes and control characters.
- **Safe JSON-LD:** JSON-LD serialisation escapes `<` in the one shared script component and in the FAQ page.

**Staff authorization**
- Changing the `owner` role requires the acting Staff member to be an owner.
- Config uploads require `results`.
- Cart item routes resolve the cart from the cart cookie and act only on that cart's items.
- Partner logo URLs must be on the Supabase storage host.

**Observability**
- Sentry, provisioned through the Vercel Marketplace, is wired via `instrumentation.ts`.
- The `[lang]` error page and the global error page exist.
- Dispute events and webhook failures notify the existing Staff Telegram chat, the channel already used for Result submits.

**Database hygiene** (one migration):
- `set search_path = public` on the 5 flagged functions
- revoke anon execute on `current_customer_id()`
- `(select auth.uid())` in the customer policies
- Leaked password protection is a manual Supabase dashboard toggle.

**Low-priority cleanup**
- **Public search:** input is escaped before it is built into the PostgREST `.or()` filter.
- **Public error responses:** a stable message, with details logged on the server.
- **Reference photos** move to the private bucket and are read through signed URLs by Staff and the Result owner only.
- **Lockfiles:** `package-lock.json` is removed (pnpm is canonical).

## Testing Decisions

- **What a good test is:** it drives the route or module through its public interface: a request in, then a response and resulting DB or Stripe calls out. It asserts behaviour an attacker or a customer would observe, never internal call order. Each security fix has a test that **fails on today's code**.
- **Modules with tests:**
  - constant-time secret helper
  - escape and exact-match lookups (coupon `%`, `_`, prefix)
  - customised checkout pricing (wrong Variant → 400; recomputed price equals the composed subtotal)
  - per-Variant stock aggregation
  - Result hold (someone else's `responseId` without a token → 403; retry never deletes)
  - accept (two concurrent calls → one Order)
  - webhook (duplicate `checkout.session.completed` → one confirmation, one email; handler failure → 5xx)
  - tax country validation
  - self-referral
  - Add-on quantity schema
  - booking slot validation
  - safe-next-path (`/\evil.com` → fallback)
  - JSON-LD escaping
  - owner role guard
  - cart item ownership
  - partner logo host
- **Prior art:**
  - vitest route tests under `app/**/__tests__/`, such as the shop cart page test
  - `lib/results/access.ts` and its tests
  - the conditional-claim pattern in the Result finish route
  - the existing Stripe webhook tests and money ledger idempotency
- `.check.ts` files run in nothing, so new checks must be vitest.
- **Not unit-tested (checked in sign-off):**
  - Firewall rules, BotID and security headers, by probing a deploy
  - env vars, via cron 200s and a Shopify 401
  - Sentry, via a deliberate error

## Out of Scope

- **Content-Security-Policy.** GTM, Stripe and Supabase need an allowlist and a report-only period. It is a follow-up.
- **Moving the rate limiter to shared storage** (Upstash/Redis). Pro Firewall rules replace that need.
- **`refund.updated`** is owned by PayNow slice 02 (#143).
- **Refactoring the webhook's other event handlers** beyond the atomic claim, error checks and the one new event.
- **Rotating secrets.** No secret was found leaked.
- **A penetration test by a third party**, and a WAF beyond Vercel Firewall.
- **Reversing milestone bonuses on refund.** It is noted as a business decision; slice 09 only stops self-referral at the source.
- **Two-account Stripe `stripe_product_id` thrash.** It is tracked in the Stripe account migration.

## Further Notes

- **Do slice 01 today.** It is two env vars and no code, and every cron in prod refuses to run until they are set.
- **Order:** P0 slices (01–07) are independent of each other and can run in parallel worktrees. Slice 09 builds on 03 and 04, slice 11 needs 10, and slice 16 needs 13. Slice 17 closes the PRD.
- **Deploys and migrations:** merging to `main` auto-deploys to prod, but migrations are not automated. Slices 09 and 15 carry migrations; apply them in the same sitting with `supabase db push`, never the MCP apply.
- **Graph:** committing any of this needs `./scripts/graphify update .` in the same commit.
- The repo is private. This PRD names exploit paths deliberately; don't copy it anywhere public.
