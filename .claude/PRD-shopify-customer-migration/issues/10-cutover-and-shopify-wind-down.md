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

Planned for Thu 31 Dec 2026 (owner, 13 Nov 2026), then brought forward (owner, 18 Nov 2026): the
switch comes before the launch, on a day the owner sets. Until the launch, anyone who types
mpillow.com lands on the Explore page. The launch itself stays at 23:59 on 31 Dec, Singapore time.
The code is ready, so the day is DNS, one setting and a redeploy:

- `lib/shopify-redirects.ts` sends every old Shopify address to its new page in one hop, from
  the redirect map approved 11 and 13 Nov 2026. It already answers on custom.mpillow.com, so the
  agency can test the map there before the day.
- `proxy.ts` sends custom., work. and the bare domain to the host in `NEXT_PUBLIC_SITE_URL`,
  except `/api` (webhooks and crons stay on custom.mpillow.com) and `/auth`. It never sends
  www. away.
- Until the launch, someone arriving at the home page of mpillow.com or www.mpillow.com (typed,
  bookmarked or from another site) is sent to `/{language}/explore`; a click on the site itself
  is not (`lib/routing/explore-entry.ts`, #432). It is an uncached 307, so it stops at the launch
  minute with no deploy. From the bare domain it is one hop: `mpillow.com/` →
  `www.mpillow.com/en-US/explore`. custom.mpillow.com keeps its home page for Staff. Until the
  launch, the 21 old addresses the map sends to the home page take one more hop, to Explore.

### Before the day

None of this changes what visitors see.

1. **Search Console baseline (owner or agency).** From the www.mpillow.com property, or the
   `sc-domain:mpillow.com` domain property, export Performance by page and by query for the last
   16 months, and the Pages (indexing) report. The app's own Search Console data cannot stand in:
   every page row in `seo_daily_metrics` is on custom.mpillow.com, and only for 10–19 Jul 2026.
2. **Snapshot of the old site: done 18 Nov 2026.** `docs/cutover/shopify-snapshot-2026-11-18.json`
   (`scripts/snapshot-shopify-site.py`) has each of the 215 old addresses' status, title,
   description, canonical and headings: 212 answered 200, the sign-in link 302 to Shopify's
   login, and two were already 404 on Shopify (`/blogs/news/3-min-neck-pain-relief-stretches`,
   `/pages/space-rental`). Shopify's own sitemaps listed 185 addresses, all in the map. It also
   holds the full text of the 14 blog posts the map sends to the home page; the 12 retired in
   October are in git too, as `data/blogs/<slug>.mdx` at `a1e0cf92^` (#252). If the agency's
   data shows any of the 14 still earns clicks or links, bring it over as a real post from that
   text and point its row at it.
3. **Redirect test on custom.mpillow.com: passed 18 Nov 2026,** 218 of 218
   (`docs/cutover/redirect-check-custom-2026-11-18.json`). All 214 old page addresses answered
   the approved status in one hop with ad tags kept, all 46 landing pages answered 200, the home
   page kept its language redirect and feeds answered 410. To repeat it:
   `NODE_USE_ENV_PROXY=1 node scripts/check-shopify-redirects.mjs https://custom.mpillow.com`
   (the variable is only needed behind a proxy).
4. **Add the two domains to the project.** Vercel → mp-inv → Settings → Domains: add
   `www.mpillow.com` and `mpillow.com`, with no redirect between them (`proxy.ts` does that).
   On 18 Nov 2026 neither was on the project, so deleting the Shopify records alone would have
   shown Vercel's "deployment not found" page. Adding them moves no traffic: the A and CNAME
   records to Shopify keep answering until they are deleted.
5. **Supabase → Authentication → URL configuration:** add `https://www.mpillow.com/**` to the
   redirect URLs, so sign-in links can finish on www from the first minute.
6. **Shopify notices live** (step 1 above), naming the date.

### On the day, in this order

1. **DNS first.** In Vercel DNS, delete `A @ 23.227.38.65` and `CNAME www shops.myshopify.com`.
   Leave the mail, SPF, DKIM and verification records alone. www now serves this site, still
   naming custom. as the main address for a few minutes.
2. **Then the setting.** Set `NEXT_PUBLIC_SITE_URL=https://www.mpillow.com` for Production and
   redeploy (the value is fixed at build). custom. now forwards to www.
   Doing this before step 1 would send custom.mpillow.com visitors to Shopify until DNS moves.
3. Supabase → Authentication → URL configuration: Site URL `https://www.mpillow.com`, keeping
   custom.mpillow.com in the redirect list.
4. **Stripe → Settings → Payment method domains:** add `www.mpillow.com` (ADR 0053). On
   18 Nov 2026 only custom.mpillow.com and checkout.stripe.com were registered. Until www is,
   checkout there shows no Apple Pay or Google Pay; card and PayNow work regardless.
5. **Delta import, then stop Shopify checkout** (steps 2 and 3 above). With www gone, the
   Shopify store still answers at its myshopify.com address until checkout is turned off.
6. **Test both names:**
   `NODE_USE_ENV_PROXY=1 node scripts/check-shopify-redirects.mjs https://www.mpillow.com`, then
   the same with `https://mpillow.com`.
7. **Search Console:** submit `https://www.mpillow.com/sitemap.xml` and remove Shopify's
   sitemaps. Point `GOOGLE_SEARCH_CONSOLE_SITE_URL` at `sc-domain:mpillow.com`, with the service
   account added to that property, so Analytics reads the new address.

**Rollback:** Vercel Instant Rollback to the last deployment built with custom., then add the
two Shopify records back. Redirects carry `Cache-Control: max-age=3600`, so no browser keeps one
for more than an hour.

## Acceptance criteria

- [ ] The delta batch reconciles, and its counts are recorded here.
- [ ] The Shopify storefront and account notices were live before checkout stopped.
- [ ] The erasure or closure method and date are recorded.
- [ ] No export file exists on any machine. Confirm this in writing here.
- [ ] The privacy policy no longer lists Shopify as a current processor.
