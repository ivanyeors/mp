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
- [ ] **Unblock production deploy** — latest `main` deploy `dpl_Bw4EuuvrHSzSQEE8YcPp2sU2mrRd` **ERROR** (TS on `lib/seo/seo.check.ts`). Live prod still on older READY deploy without host 301 / new robots.
- [ ] After green deploy: `curl -I https://work.mpillow.com` → **301** → `https://custom.mpillow.com/...`
- [ ] After green deploy: `/robots.txt` no longer disallows `mp-config` / `mbolster-config`; `/llms.txt` is curated (<10KB)

## Supabase Auth (manual dashboard)

- [x] Authentication → URL Configuration → Site URL: `https://custom.mpillow.com`
- [x] Redirect URLs: add `https://custom.mpillow.com/**`
- [ ] Keep `https://work.mpillow.com/**` during transition, remove after cutover

## Google Search Console (Slice 11 — manual)

- [ ] Add property for `https://custom.mpillow.com`
- [ ] Verify via DNS TXT or HTML meta (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` — not set in Vercel yet; add when you have the token)
- [ ] Submit sitemap: `https://custom.mpillow.com/sitemap.xml`
- [ ] Use Change of Address tool if migrating from a `work.` property

## Post-deploy verification

- [ ] `curl -I https://custom.mpillow.com` → 200/307 locale
- [ ] `curl -I https://work.mpillow.com` → 301 → custom
- [ ] `/robots.txt` sitemap host matches custom; configurators allowed
- [ ] `/llms.txt` URLs use custom + locale prefix; no full FAQ dump
- [ ] Rich Results Test on a product PDP passes

## Analytics (Slice 11)

- [x] Set `NEXT_PUBLIC_GTM_ID=GTM-TPB9LV2` in Vercel Production (legacy Shopify container)
- [x] Skip `NEXT_PUBLIC_GA_MEASUREMENT_ID` unless you need gtag outside GTM
- [ ] Confirm pageviews in GTM/GA realtime after green deploy
- [x] Root layout loads GTM/gtag in production when env is set (`components/seo/google-analytics.tsx`)
