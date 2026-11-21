# Domain Migration OPS Checklist — work → custom.mpillow.com

Parent: Slice 00 (`issues/00-domain-migration.md`) + Slice 11 (`issues/11-gsc-analytics.md`)

## Pre-deploy (code — done in repo)

- [x] `lib/site-url.ts` prod fallback → `https://custom.mpillow.com`
- [x] `.env.example` documents `NEXT_PUBLIC_SITE_URL=https://custom.mpillow.com`
- [x] `next.config.ts` 301 redirect from `work.mpillow.com` to `custom.mpillow.com`
- [x] `proxy.ts` host 301 (middleware runs before next.config — required for curl -I)
- [x] Exclude `**/*.check.ts` from `tsconfig.json` so self-checks don't fail `next build`

## Vercel / DNS

- [x] `custom.mpillow.com` resolves to Vercel (`*.vercel-dns-017.com`) + SSL works (`curl -I` → 307 `/en-US`)
- [x] `work.mpillow.com` also on Vercel (keep attached for 301 window)
- [x] `NEXT_PUBLIC_SITE_URL` set in Vercel Production + Preview (robots Host already `https://custom.mpillow.com`)
- [x] `NEXT_PUBLIC_GTM_ID` set in Vercel Production + Preview
- [x] **Unblock production deploy** — green on `ced12dbf` (`dpl_GDjQDgAk2aPpViroe2A96bpnppLN`)
- [x] After green deploy: `curl -I https://work.mpillow.com` → permanent redirect → `https://custom.mpillow.com/` (308 from Next permanent redirect; SEO-equivalent to 301)
- [x] After green deploy: `/robots.txt` allows mp-config/mbolster-config; `/llms.txt` curated (~2KB)

## Supabase Auth (manual dashboard)

- [x] Authentication → URL Configuration → Site URL: `https://custom.mpillow.com`
- [x] Redirect URLs: add `https://custom.mpillow.com/**`
- [ ] Keep `https://work.mpillow.com/**` during transition, remove after cutover

## Google Search Console (Slice 11 — manual)

- [x] Add property for `https://custom.mpillow.com`
- [x] Verify via DNS TXT or HTML meta (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)
- [x] Submit sitemap: `https://custom.mpillow.com/sitemap.xml`
- [x] Use Change of Address tool if migrating from a `work.` property (or N/A)

## Post-deploy verification

- [x] `curl -I https://custom.mpillow.com` → 200/307 locale
- [x] `curl -I https://work.mpillow.com` → permanent → custom
- [x] `/robots.txt` sitemap host matches custom; configurators allowed
- [x] `/llms.txt` URLs use custom + locale prefix; no full FAQ dump
- [ ] Rich Results Test on product surface (blocked until deploy of configurator Offer/image JSON-LD)
  - No shop accessory PDPs in prod yet (`/shop` empty; pillow/bolster are composed → soft-404 by design)
  - Spot-check URL after deploy: https://custom.mpillow.com/en-US/mp-config
  - Tool: https://search.google.com/test/rich-results?url=https%3A%2F%2Fcustom.mpillow.com%2Fen-US%2Fmp-config
  - Expect: Product (with AggregateOffer) eligible; FAQ page already FAQPage-valid as secondary check
  - FAQ (already live): https://search.google.com/test/rich-results?url=https%3A%2F%2Fcustom.mpillow.com%2Fen-US%2Ffaq

## Analytics (Slice 11)

- [x] Set `NEXT_PUBLIC_GTM_ID=GTM-TPB9LV2` in Vercel Production (legacy Shopify container)
- [x] Skip `NEXT_PUBLIC_GA_MEASUREMENT_ID` unless you need gtag outside GTM
- [x] Confirm pageviews in GTM/GA realtime after green deploy
- [x] Root layout loads GTM/gtag in production when env is set (`components/seo/google-analytics.tsx`)

## Ahrefs Site Audit (Oct 2026 report)

The code side of the 30 Oct report is fixed in the repo. Two items are Ahrefs settings, not code:

- [ ] **Changed pages not submitted to IndexNow.** Ahrefs counts pages *it* has not submitted. Since the cutover (20 Nov 2026) the site is www.mpillow.com, so this goes on the **Mpillow** (www) project: Project settings → Site Audit → Crawl settings → IndexNow, paste the key served at `https://www.mpillow.com/indexnow-key.txt` (`INDEXNOW_KEY`). Ahrefs verifies it at `/<key>.txt`, which the proxy serves. Automatic submission is a paid Ahrefs add-on; the site itself pings IndexNow on blog saves, product saves and Page Builder publishes (`lib/seo/indexnow.ts`).
- [ ] **HTTP to HTTPS redirect, Redirect chain, the root 3XX and "Redirected page has no incoming internal links".** The crawl starts at `http://custom.mpillow.com/`: Vercel's HTTPS hop, then the locale redirect from `/`. Set the project's start URL to `https://custom.mpillow.com/en-US`. Nothing on the site links to `/` any more.
- [ ] Re-crawl and confirm the rest cleared.
