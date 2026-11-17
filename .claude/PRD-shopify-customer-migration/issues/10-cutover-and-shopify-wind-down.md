# 10 — Cutover: final delta import, Shopify notices, erasure

**Issue:** [#274](https://github.com/ivanyeors/mp/issues/274) (parent #264)
**Type:** HITL
**Blocked by:** 09; owner decision 6 (cutover date)
**User stories:** 13
**Labels:** `needs-triage`, `P2`, `area:admin`

## Goal

Shopify stops being where customers live. Nobody who bought there in the last weeks is left
behind, and no copy of their data is kept longer than needed.

## Steps

1. **Before the cutover date, point Shopify customers to the new site.** In the Shopify theme,
   add an announcement bar and a notice on the customer account page linking to the new site.
   This is a theme setting, with no code and no app. It honours the 2026-10-13 rule.
2. **Delta import on cutover day.** Take a fresh export and import it from Admin Panel →
   Customers → Import from Shopify: preview, then import. Only customers new since slice 04 are
   `create` / `merge`; everyone else is `already_imported`. New consented rows enter the next
   wave automatically, because the ledger has no row for them.
3. **Stop Shopify checkout** on the cutover date. The **Shopify order mirror** tables hold no PII
   and stay as the read-only Analytics input, unchanged.
4. **Erase customer data held in Shopify.** After a grace period the owner sets, either close
   the store or request erasure. First confirm what Shopify retains after a store closes.
   Record the method and date here.
5. **Destroy every export file.** Their SHA-256 values stay in `customer_import_batches` as the
   audit trail.
6. **Update the privacy policy.** Shopify is no longer a processor. Keep the migration paragraph
   from slice 07.

## Moving www.mpillow.com here

Planned for Thu 31 Dec 2026 (owner, 13 Nov 2026). The code is ready, so the day is DNS, one
setting and a redeploy:

- `lib/shopify-redirects.ts` sends every old Shopify address to its new page in one hop, from
  the redirect map approved 11 and 13 Nov 2026. It already answers on custom.mpillow.com, so the
  agency can test the map there before the day.
- `proxy.ts` sends custom., work. and the bare domain to the host in `NEXT_PUBLIC_SITE_URL`,
  except `/api` (webhooks and crons stay on custom.mpillow.com) and `/auth`. It never sends
  www. away.

On the day, in this order:

1. **DNS first.** In Vercel DNS, delete `A @ 23.227.38.65` and `CNAME www shops.myshopify.com`.
   Leave the mail, SPF, DKIM and verification records alone. www now serves this site, still
   naming custom. as the main address for a few minutes.
2. **Then the setting.** Set `NEXT_PUBLIC_SITE_URL=https://www.mpillow.com` for Production and
   redeploy (the value is fixed at build). custom. now forwards to www.
   Doing this before step 1 would send custom.mpillow.com visitors to Shopify until DNS moves.
3. Supabase → Authentication → URL configuration: Site URL `https://www.mpillow.com`, keeping
   custom.mpillow.com in the redirect list.

**Rollback:** Vercel Instant Rollback to the last deployment built with custom., then add the
two Shopify records back. Redirects carry `Cache-Control: max-age=3600`, so no browser keeps one
for more than an hour.

## Acceptance criteria

- [ ] The delta batch reconciles, and its counts are recorded here.
- [ ] The Shopify storefront and account notices were live before checkout stopped.
- [ ] The erasure or closure method and date are recorded.
- [ ] No export file exists on any machine. Confirm this in writing here.
- [ ] The privacy policy no longer lists Shopify as a current processor.
