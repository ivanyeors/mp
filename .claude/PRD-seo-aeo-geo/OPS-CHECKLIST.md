# Domain Migration OPS Checklist — work → custom.mpillow.com

Parent: Slice 00 (`issues/00-domain-migration.md`)

## Pre-deploy (code — done in repo)

- [x] `lib/site-url.ts` prod fallback → `https://custom.mpillow.com`
- [x] `.env.example` documents `NEXT_PUBLIC_SITE_URL=https://custom.mpillow.com`
- [x] `next.config.ts` 301 redirect from `work.mpillow.com` to `custom.mpillow.com`
- [x] `proxy.ts` host 301 (middleware runs before next.config — required for curl -I)

## Vercel / DNS (manual)

- [ ] Add `custom.mpillow.com` as domain in Vercel project
- [ ] Create DNS CNAME: `custom.mpillow.com` → `cname.vercel-dns.com` (or Vercel-assigned target)
- [ ] Verify SSL certificate issued for `custom.mpillow.com`
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://custom.mpillow.com` in Vercel Production env
- [ ] Keep `work.mpillow.com` attached briefly for 301 redirect window, then remove after GSC migration

## Supabase Auth

- [ ] Authentication → URL Configuration → Site URL: `https://custom.mpillow.com`
- [ ] Redirect URLs: add `https://custom.mpillow.com/**`
- [ ] Remove or keep `https://work.mpillow.com/**` during transition

## Google Search Console (Slice 11)

- [ ] Add property for `https://custom.mpillow.com`
- [ ] Verify via DNS TXT or HTML meta (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)
- [ ] Submit sitemap: `https://custom.mpillow.com/sitemap.xml`
- [ ] Use Change of Address tool if migrating from work. property

## Post-deploy verification

- [ ] `curl -I https://custom.mpillow.com` → 200
- [ ] `curl -I https://work.mpillow.com` → 301 → custom
- [ ] `/robots.txt` sitemap host matches custom
- [ ] `/llms.txt` URLs use custom + locale prefix
- [ ] Rich Results Test on a product PDP passes

## Analytics (Slice 11)

- [ ] Set `NEXT_PUBLIC_GTM_ID=GTM-TPB9LV2` in Vercel Production (legacy Shopify container)
- [ ] Skip `NEXT_PUBLIC_GA_MEASUREMENT_ID` unless you need gtag outside GTM
- [ ] Confirm pageviews in GTM/GA realtime after deploy
- [x] Root layout loads GTM/gtag in production when env is set (`components/seo/google-analytics.tsx`)
