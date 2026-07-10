# PRD: Technical SEO, AEO, and GEO

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + external research brief (Section 4)
Canonical domain (approved): `https://custom.mpillow.com` — migrate from `work.mpillow.com` **before** SEO work lands

## Problem Statement

Mpillow's Next.js storefront has partial SEO/AEO foundations (robots, sitemap, product metadata, FAQ JSON-LD, dynamic llms.txt) but is not optimized for human search engines **or** AI answer engines (ChatGPT, Perplexity, Google AI Overviews).

Concrete gaps today:

- **URL drift:** `robots.ts`, `lib/site-url.ts`, `llms.txt`, and blog JSON-LD each assume different hosts (`mpillow.com`, `work.mpillow.com`, `www.mpillow.com`) and often omit locale prefixes.
- **Thin structured data:** Product pages emit basic `Product` + `AggregateOffer` but lack `AggregateRating`, `BreadcrumbList`, SKU, real availability, and per-variant `Offer`. Reviews exist in DB but are client-fetched only.
- **llms.txt is a content dump:** Full FAQ + full blog bodies inline — not the curated AI guide the research describes.
- **No answer-first pattern:** Landing, blogs, and PDPs lack the 60–120 word direct-answer lede that AEO/GEO prioritizes.
- **Commercial intent pages blocked:** `mp-config` and `mbolster-config` are disallowed in robots and have no metadata — yet these are the actual conversion paths for "customised pillow Singapore."
- **Keyword targeting is blog-only:** ~90 posts cover Singapore intent via slugs, but no `/guides/` hubs; shop categories are query params (`?category=`), weak for category SEO.
- **Homepage/shop listing metadata missing:** Root layout metadata is generic `"Mpillow"`; no `metadataBase`, no sitewide `Organization`/`WebSite` schema.
- **Educational content trapped in slide-ins:** Learn-more slide-in content is rich but non-indexable.

## Solution

From a **searcher/AI assistant** perspective: queries like "pillow for neck pain Singapore" or "customised pillow Singapore" surface Mpillow with a direct answer, accurate pricing/reviews in structured data, and links to the right product or customisation flow.

From a **developer** perspective:

1. **Migrate** `work.mpillow.com` → `custom.mpillow.com` with 301 redirects; single `NEXT_PUBLIC_SITE_URL`.
2. **Centralize** SEO helpers (`getSiteOrigin`, metadata builders, JSON-LD builders) — one source of truth for all URLs.
3. **Enrich** Product JSON-LD on every **Storefront product** PDP with per-product `AggregateRating` from approved DB reviews.
4. **Restructure** llms.txt as a curated index (brand, taxonomy, key URLs, target queries) — not a full content mirror.
5. **Allow + SEO-wrap** `mp-config` and `mbolster-config`: server metadata, answer lede, Product/Offer JSON-LD; interactive wizard below.
6. **Tiered answer-first content:** homepage, PDPs, FAQ, top ~10 Singapore blogs, then `/guides/{topic}` editorial hubs linking to configurators and PDPs.
7. **Ratings placement (approved):** per-product ratings on PDPs; main composed-sellable ratings on landing cards + customisation flow; accessory ratings on shop listing cards.
8. **No duplicate commercial pages:** `/guides/` for editorial intent; `mp-config` / `mbolster-config` for commercial intent.

## User Stories

### Domain and infrastructure

1. As a search engine crawler, I want one canonical host (`custom.mpillow.com`) with 301s from `work.`, so that link equity consolidates.
2. As a developer, I want all SEO URLs built from `getSiteOrigin()` + locale prefix, so that changing env does not require code edits.
3. As a developer, I want a shared SEO module for metadata and JSON-LD, so that schema is consistent and DRY.
4. As a search engine, I want `metadataBase` set in root layout, so that relative OG image URLs resolve correctly.
5. As an AI crawler, I want `robots.txt` to reference sitemap and llms.txt on the canonical host, so that discovery is explicit.

### Structured data

6. As a search engine, I want `Organization` + `WebSite` JSON-LD on the homepage, so that Mpillow is a recognized entity.
7. As a search engine, I want full `Product` schema on every active **Storefront product** PDP, so that rich results can show price and availability.
8. As a search engine, I want `AggregateRating` on a PDP only when that product has ≥1 approved review, so that star ratings are truthful.
9. As a search engine, I want `BreadcrumbList` on PDPs, so that hierarchy is machine-readable.
10. As a search engine, I want variant SKU and real stock availability in offers, so that AI tools can cite accurate purchase data.
11. As a search engine, I want `FAQPage` schema on the FAQ page to stay accurate after URL fixes, so that FAQ rich results work.
12. As a search engine, I want blog `Article` + `BreadcrumbList` URLs to match locale-prefixed canonical paths, so that citations are correct.

### llms.txt and AEO endpoints

13. As an LLM crawler, I want a concise llms.txt with brand summary and product taxonomy, so that I understand Mpillow positioning without parsing megabytes.
14. As an LLM, I want llms.txt to link to key educational URLs and `/api/faq`, so that I can fetch structured FAQ data on demand.
15. As an LLM, I want target query phrases listed in llms.txt, so that retrieval aligns with high-intent searches.

### Answer-first content (tiered)

16. As a searcher asking "what is Mpillow?", I want a 60–120 word direct answer under the homepage H1, so that I get an immediate answer before scrolling.
17. As a searcher on a product page, I want a concise answer lede under the product H1, so that AI and humans get fact-dense context first.
18. As a searcher reading top Singapore-intent blog posts, I want an answer lede after the title and proper H2 headings, so that posts are AEO-shaped.
19. As a marketing operator, I want to edit `seo_answer` per product locale in settings, so that answer ledes are CMS-managed.
20. As a developer, I want blog MDX/content to use semantic `##` headings where posts use Q-style sections, so that crawlers see hierarchy.

### Commercial intent (configurators)

21. As a searcher for "customised pillow Singapore", I want `mp-config` to be crawlable with metadata and an answer lede, so that the customisation flow ranks without a duplicate landing page.
22. As a searcher for bolster queries, I want `mbolster-config` crawlable with metadata and answer lede, so that commercial bolster intent is covered.
23. As a visitor from a `/guides/` hub, I want a clear CTA into `mp-config` or `mbolster-config`, so that editorial content converts without page duplication.
24. As a developer, I want configurator SEO as a server-rendered shell above the client wizard, so that metadata works without rewriting the client page in one pass.

### Editorial hubs and keywords

25. As a searcher for "pillow for neck pain Singapore", I want a `/guides/neck-pain` hub with answer lede + links to blogs, Basic/Premium PDPs, and mp-config, so that intent is served in one place.
26. As a searcher for "best cervical pillow Singapore", I want hub content linking to cervical accessory PDP and Premium story, so that product and editorial paths connect.
27. As a searcher for "customised pillow Singapore", I want a `/guides/custom-pillow` hub CTAing to mp-config, so that editorial and commercial paths align.
28. As a marketing operator, I want hub pages to reuse learn-more slide-in i18n content where possible, so that trapped education becomes indexable without rewrite.

### Ratings display (approved placement)

29. As a homepage visitor, I want star ratings on main product cards (Basic, Premium, Mbolster), so that social proof appears at discovery.
30. As a customisation visitor, I want to see composed-sellable ratings in the mp-config/mbolster-config SEO shell, so that trust is established before commitment.
31. As a shop visitor browsing accessories, I want per-accessory ratings on shop listing cards, so that accessory social proof is visible before clicking through.
32. As a PDP visitor, I want per-product ratings reflected in JSON-LD, so that stars match visible reviews.

### Shop and listings

33. As a search engine, I want the shop index page to have title, description, and canonical metadata, so that `/shop` is not a generic inherit.
34. As a search engine, I want accessory category views to have meaningful metadata, so that accessory discovery improves.
35. As a developer, I want `/shop/cart`, `/account/*`, and checkout to be noindex, so that thin/private pages do not compete in SERPs.

### Analytics and verification

36. As a marketing operator, I want Google Search Console verified on `custom.mpillow.com`, so that indexing can be monitored post-migration.
37. As a marketing operator, I want analytics (GTM/gtag) migrated from legacy Shopify HTML, so that traffic measurement continues.

### Domain glossary

38. As a developer, I want SEO/AEO/GEO terms documented in `CONTEXT.md`, so that agents use consistent vocabulary.

## Implementation Decisions

### Approved design decisions (grill session)

| Decision | Resolution |
|----------|------------|
| Canonical domain | `custom.mpillow.com` — migrate first |
| Answer-first scope | Tiered: homepage + PDPs + FAQ + top ~10 SG blogs → then `/guides/` |
| Review schema | Per-product approved DB reviews on each PDP only |
| Ratings UI | Main products on landing/customisation cards; accessories on shop cards |
| llms.txt | Curated index (~2–4 KB), not full blog dump |
| Keyword strategy | `/guides/` editorial hubs + configurators for commercial intent |
| Configurator crawl | Allow `mp-config` + `mbolster-config` in robots; add metadata + answer lede |
| mp-basic | Stays disallowed (subset flow, not landing) |

### Deep modules

| Module | Responsibility |
|--------|----------------|
| `site-origin` | Single canonical origin resolver |
| `seo-metadata` | `buildPageMetadata()` → Next Metadata with canonical + hreflang |
| `jsonld-product` | Product JSON-LD with optional AggregateRating, BreadcrumbList, offers |
| `jsonld-organization` | Sitewide Organization + WebSite |
| `jsonld-article` | Blog post schema with locale-correct URLs |
| `review-aggregate` | Server-side `{ average, count }` for approved reviews |
| `llms-index` | Build curated llms.txt string |
| `answer-lede` | `seo_answer` → `seo_description` → `description` fallback |

### Schema and data changes

- Add optional `seo_answer` to localized product content and blog post content JSON.
- Settings UI: textarea for `seo_answer` in product and blog editors.
- No new tables for reviews.

## Testing Decisions

Assert externally visible outputs — canonical URLs, JSON-LD shape, AggregateRating omitted when count=0, llms.txt curated format, answer lede fallbacks.

| Module | Test |
|--------|------|
| `review-aggregate` | Correct average/count; empty when no approved reviews |
| `jsonld-product` | AggregateRating iff count≥1; includes SKU |
| `seo-metadata` | Canonical + hreflang use getSiteOrigin() |
| `llms-index` | Output < 10KB; contains taxonomy |
| `answer-lede` | Fallback chain |

## Out of Scope

- Apex domain (`mpillow.com` / `www`) migration
- Paid search / SEM campaigns
- New blog copy writing (retrofit structure only)
- Translating answer ledes to `zh-CN` in v1
- Image sitemap, sitemap index split
- Duplicate `/shop/pillows` commercial landing pages
- Learn-more slide-in layout refactor (separate PRD)

## Further Notes

See `issues/README.md` for vertical slice breakdown and build order.
