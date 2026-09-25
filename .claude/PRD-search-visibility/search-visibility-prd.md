# PRD: Search & AI Visibility — Measurement and Discovery

Status: Draft (needs-triage)
Source: Research session (Sep 2026) — SEO/AEO tracking integration + content effectiveness review
Builds on: `PRD-seo-aeo-geo` (technical SEO/AEO foundations — slices 00–11 shipped), `PRD-prospect-journey-analytics` (first-party `analytics_visits` / `analytics_events`)
Canonical domain: `https://custom.mpillow.com`

## Problem Statement

`PRD-seo-aeo-geo` shipped the foundations: canonical domain, Product/Organization/Article JSON-LD, curated llms.txt, crawlable configurator SEO shells, `/guides/` hubs, GSC verification and GTM. Two gaps remain.

**1. We cannot see whether any of it is working.**

- Search Console (clicks, impressions, CTR, position) lives only in Google's UI. It keeps 16 months of history, then deletes it, and the UI exports cap at 1,000 rows.
- AEO has no measurement at all. We don't know which AI assistants send visitors, whether AI crawlers read our pages, or whether we are cited in AI Overviews, AI Mode or Copilot.
- `/settings/analytics` covers sales, margin, inventory and prospect journeys. It shows nothing about how people discover us, so an SEO change cannot be judged against a before/after line.
- The GTM container (`GTM-TPB9LV2`) is the legacy Shopify container. It is unconfirmed whether it feeds a GA4 property scoped to `custom.mpillow.com`.

**2. The content strategy was built for the pre-AI search results page.**

- The 91 blog posts are mostly thin, and many compete with each other for the same searches. See **Content audit baseline** below. In short:
  - The median post is about 330 words.
  - About 55 posts fall into 6 groups that target the same search intent. For example, 11 posts target "best / neck-support pillow Singapore" and 11 target "Mbolster for side sleepers".
  - 75 of 91 posts have empty meta descriptions.
  - 81 of 91 posts lost their heading structure when they were scraped from Shopify.
  - Almost no posts have internal links or cite sources.
  - Posts were published in bursts of two a day, a few minutes apart.
- Informational queries now carry AI Overviews on a large share of results. Studies report a 58–61% drop in top-result CTR when an AI Overview is present. Generic "how to choose a pillow" posts are exactly the content an AI summary replaces.
- Google's 2026 core and spam updates name scaled, templated content as a target. The helpful-content signal is **site-wide**, so a large block of thin posts can weigh on the configurator and product pages that actually convert.
- AI assistants cite **third-party** sources far more than brand blogs: Reddit, review aggregators, journalism/listicles, YouTube and Google Business Profile for local queries. Mpillow has little presence in those sources. Competitors, meanwhile, publish near-identical "X Singapore: The 2026 Guide" posts, so more of the same is not a differentiator.
- We hold assets competitors cannot copy but do not publish: fitting data from customisation sessions (**Results**), approved reviews, Google Places reviews, in-store appointments and staff fitting expertise.

## Content audit baseline (Sep 2026)

This audit was read-only and based on the local `data/blogs/*.mdx` copy (91 posts scraped from Shopify). Only 10 bodies were synced back to `blog_posts`, so slice 09 must re-run the audit against the database.

| Signal | Finding |
|--------|---------|
| Length | 201–2,984 words; median ~330; ~70% under 450 |
| Structure | 81/91 have no markdown H2/H3 (headings were flattened into plain lines); 8 use question-style H2s |
| Meta / Answer lede | 75/91 have `description: ""`; 0 have `seo_answer` → most posts have no lede and no meta description |
| Internal links | 1/91 links to `mp-config`; 0 link to `mbolster-config`, `/shop`, `/guides` or another post |
| Citations | 0 outbound citations; 8 "according to" with no source |
| Media | 0 inline images; hero `alt` = title |
| Experience signals | Only 4 posts carry first-hand/expert material: KH Poon physio talk, Macquarie Chiropractic, founder story, configuration guide |
| Authorship | `Person` author with no URL, credentials or sameAs; DB default author is "Mpillow" |
| Freshness | `dateModified` = row `updated_at`, so a bulk sync makes every post look fresh; the page shows no updated date |
| Cadence | 2019 → Feb 2026, often 2 posts minutes apart (content-mill pattern) |
| Templating | No copy-paste, but recurring stock filler ("game-changer" ×14, "Whether you're a side sleeper" ×11) |

**Defects visible today:**
- `which-mpillow-configuration-is-for-you` was published with placeholders: "[image here]" and "xxx cm".
- One slug is broken: `p-how-a-tailored-pillow-…-p-p-p`.
- There are mojibake encoding errors, e.g. "youâ€™ll".
- A post attributes "necessity is the mother of invention" to Plato.
- The "Top 5 pillows" post lists no pillows.

**Posts competing for the same search (~55 of 91):**

| Group | Posts |
|-------|-------|
| Best / neck-support pillow Singapore | 11 |
| Cervical pillow | 5 |
| Custom pillow for neck pain | 5 |
| Custom pillow, general benefits | 8 |
| Mbolster for side sleepers | 11 |
| Bolster for neck pain | 4 |
| Exact duplicate pairs | 4 pairs: bolster vs pillow; replace pillow; modular pillow; kids adjustable firmness |
| World Sleep Day | 3 posts |

**Assets not yet used:**
- Results / `mp_config_responses`: suggested vs assigned size/tier/length, filling template, measuring staff, location, discovery source.
- `product_reviews` and Google Places reviews.
- The physio and chiropractor collaborations.
- Customer fitting photos (`mp_config_response_photos`) exist but are private; they need consent before any use.

**Verdict:** as they stand, the articles are mostly ineffective for SEO/AEO and are a site-wide quality liability. The fix is fewer, stronger pages, not more posts:
- About 55 posts collapse into about 8 canonical pages.
- About 15–20 posts are pruned.
- The rest get basic fixes: descriptions, headings, links.

The bigger levers are original data, reviews, Google Business Profile, Merchant Center and third-party mentions.

## Solution

From an **operator** perspective: a "Search & AI visibility" section on `/settings/analytics` shows, over any date range, organic clicks/impressions/CTR/position, AI-assistant referrals, AI crawler activity and target-query rankings. Markers show when each SEO or content change shipped, and a funnel view shows which of those visits became mp-config completions or orders.

From a **searcher / AI assistant** perspective: Mpillow is the Singapore brand that shows up with original fitting data, real reviews, a verified local business profile, product listings in Google Shopping/AI Mode, and independent mentions (listicles, Reddit, video). It is not one more generic pillow guide.

From a **developer** perspective:

1. **Own the history.** A daily job snapshots Search Console into Supabase, so the admin page never calls Google live and the data outlives the 16-month window.
2. **Measure AEO first-party.** Classify `analytics_visits.referrer_host` into AI assistant sources, which covers Perplexity where GA4's built-in channel does not and joins directly to orders. Log AI crawler hits in `proxy.ts`.
3. **Annotate.** A small `seo_annotations` table puts ship dates on every chart.
4. **Fill API gaps by hand.** Some sources have no API today: GSC's Generative AI report, Bing's AI Performance report, Ahrefs backlinks. Staff upload the CSV exports, and the data lands in the same table.
5. **Consolidate content.** Audit the blog, merge overlapping posts into fewer, stronger pages (301s), and prune or `noindex` thin ones.
6. **Publish what only we have.** A first-party fitting-data report built from anonymised Results, plus review- and expert-backed pages.
7. **Grow off-site discovery.** Merchant Center free listings, Google Business Profile with review velocity, Bing Webmaster + IndexNow, and an OPS playbook for listicles, Reddit and short video.

## User Stories

### Measurement — Search Console

1. As an operator, I want organic clicks, impressions, CTR and average position over time, so that I can see whether search performance is improving.
2. As an operator, I want those metrics compared against the previous period (and year-over-year once history exists), so that seasonality doesn't mislead me.
3. As an operator, I want history kept beyond Google's 16 months, so that year-over-year comparisons remain possible.
4. As an operator, I want the last ~3 days marked as partial, so that GSC's reporting lag is not mistaken for a drop.
5. As an operator, I want the top queries and pages that gained or lost the most, so that I know what to fix or double down on.
6. As a marketer, I want a watchlist of target queries (seeded from llms.txt target queries) with position and clicks over time, so that I get rank tracking without a paid tool.
7. As a developer, I want CTR and position always recomputed from clicks/impressions (impression-weighted), so that the dashboard never averages averages.

### Measurement — AEO

8. As an operator, I want sessions from AI assistants (ChatGPT, Perplexity, Gemini, Claude, Copilot, DeepSeek, Grok) as their own channel, so that I can see AEO traffic grow.
9. As an operator, I want AI-assistant visits joined to mp-config completions and orders, so that I know whether AI discovery converts.
10. As an operator, I want daily AI crawler hits by bot and path (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended-adjacent fetchers, Bingbot), so that I get a leading indicator before citations appear.
11. As an operator, I want `/llms.txt` fetches counted separately, so that I know whether AI crawlers use it.
12. As an operator, I want to upload GSC's Generative AI performance export and Bing's AI Performance (Copilot citations) export, so that AI Overview/AI Mode impressions and Copilot citations appear on the same timeline.

### Measurement — display

13. As an operator, I want a KPI row (clicks, impressions, CTR, avg position, AI-referred sessions, AI crawler hits), each with a delta and sparkline, so that I get the state at a glance.
14. As an operator, I want clicks and impressions as two aligned small-multiple charts, not a dual-axis chart, so that the trends are honest.
15. As an operator, I want average position on an inverted axis (up = better), with a falling number shown as good, so that the chart reads intuitively.
16. As an operator, I want a stacked area of sessions by channel (Organic search, AI assistant, Direct, Referral, Paid, Social), so that the channel mix over time is visible.
17. As an operator, I want vertical markers for SEO/content events (domain migration, llms.txt, ratings, blog consolidation, listicle placements), so that I can attribute changes.
18. As an operator, I want to add, edit and delete annotations from the analytics page, so that marketing can log off-site wins without a developer.
19. As an operator, I want weekly granularity by default and daily on demand, so that noise does not dominate.

### Measurement — sources and ops

20. As a developer, I want GSC data fetched with a service account that has restricted read access, so that no personal OAuth token is required.
21. As an operator, I want an optional GA4 Data API ingest of organic/AI-assistant sessions and conversions, so that GA4 can be cross-checked against first-party numbers once the GA4 property is confirmed.
22. As an operator, I want a weekly Ahrefs Domain Rating snapshot (free endpoint, attribution shown), so that authority growth is visible.

### Content effectiveness

23. As a marketer, I want every blog post classified as keep / merge / refresh / prune from GSC data plus a quality review, so that effort goes where it pays.
24. As a searcher, I want one definitive page per intent (e.g. neck-pain pillow in Singapore), not five near-duplicates, so that I get the best answer and Google knows which page to rank.
25. As a search engine, I want merged posts to 301 to their consolidated target, and sitemap/llms.txt updated to match, so that link equity carries over.
26. As a search engine, I want posts with no impressions and no unique value pruned (410 or `noindex`), so that site-wide quality signals improve.
27. As a searcher, I want consolidated pages to carry a named author/reviewer, updated date, first-hand photos and cited sources, so that they meet experience/expertise expectations.
28. As a marketer, I want a content brief standard (unique angle required: our data, our fitting process, our reviews), so that new posts are not commodity rewrites.

### Original first-party content

29. As a searcher or AI assistant, I want a "Singapore sleep & pillow fit report" built from anonymised customisation data (e.g. common sleep positions, height/filling preferences by sleep position, neck-pain share), so that there is a citable, original source.
30. As a developer, I want the report's figures computed from Results with minimum-count thresholds (k-anonymity), so that no individual can be identified.
31. As a search engine, I want the report page to carry `Dataset`/`Article` JSON-LD with a methodology section and an update date, so that it is citable.
32. As a marketer, I want review-backed "what customers with X say" sections on hubs (from approved reviews), so that pages carry real voices rather than generic claims.

### Off-site discovery

33. As a shopper using Google Shopping / AI Mode / Gemini, I want Mpillow products in the Shopping Graph via Merchant Center free listings, so that product answers can include us.
34. As a developer, I want a product feed generated from **Storefront products** and **Costings** (single source of sell price), so that feed prices never drift from the site.
35. As a local searcher, I want an accurate Google Business Profile with steady fresh reviews, so that we appear in local packs and local AI Overviews.
36. As an operator, I want customers prompted for a Google review after an appointment or delivery (WhatsApp/email), so that review velocity is steady and organic.
37. As a Copilot/ChatGPT-search user, I want Mpillow indexed fast in Bing (which grounds Copilot and ChatGPT search), so that new and changed pages are discoverable quickly — via Bing Webmaster Tools + IndexNow pings on publish.
38. As a marketer, I want an OPS playbook for earned mentions — Singapore "best pillow" listicle inclusion, authentic Reddit/HardwareZone participation, short fitting videos on YouTube — with each placement logged as an annotation, so that off-site work is tracked against the same timeline.

## Implementation Decisions

### Design decisions

Confirmed by the user (Sep 2026): merchant feed uses price ranges; pruning approved; no GA4 property exists, so a new one is set up per `GA4-SETUP.md`.

| Decision | Proposal | Rationale |
|----------|----------|-----------|
| Primary SEO source | GSC Search Analytics API | Free, authoritative, per-query/page |
| Storage | Daily snapshots in Supabase; admin reads Supabase only | Outlives 16-month window; no API latency/quota on page load |
| AEO traffic source of truth | First-party `analytics_visits.referrer_host` classifier | Covers Perplexity; joins to orders; history since Jul 2026 |
| GA4 | **Confirmed:** new GA4 property loaded via direct gtag (`NEXT_PUBLIC_GA_MEASUREMENT_ID`); legacy GTM audited then retired; conversions sent as `gtag('event')` key events | No existing property; the GTM container is Shopify-era and unmaintained |
| Ahrefs | Domain Rating free endpoint only; backlinks/audit via Ahrefs UI | Full API is paid |
| Gen-AI impressions / Copilot citations | Manual CSV upload until APIs exist | No API as of Sep 2026 |
| Auth to Google | Service account, restricted GSC user + GA4 Viewer | Avoids another personal refresh token |
| Cron | Chain inside `results-sla` (Hobby plan = 2 crons) | Same pattern as `ga-sync` |
| Charts | visx (existing), dataviz palette | Consistency with page |
| Blog | **Confirmed:** consolidate and prune (~15–20 posts) once the slice 09 map is approved; no new commodity posts | Cannibalisation + site-wide quality |
| Merchant feed pricing | **Confirmed: price range.** Composed sellables are listed as one item per **Variant** (size × tier / length), grouped by `item_group_id`, each with its own Costings price. Each links to `mp-config` / `mbolster-config` preselected to that variant, which displays that exact price | Merchant Center takes a single price per item, not a range; a range becomes a set of variant items. The landing price must match or items are disapproved |

### Deep modules

| Module | Responsibility |
|--------|----------------|
| `lib/google/search-console.ts` | Authenticated `searchanalytics.query` with pagination (25k rows), dimension sets, retries |
| `lib/seo-metrics/ingest-gsc.ts` | Fetch window (last 3 days re-fetched + backfill), upsert snapshots idempotently |
| `lib/seo-metrics/aggregate.ts` | Period rollups; CTR/position recomputed from sums; period-over-period deltas; movers |
| `lib/analytics/ai-referrers.ts` | `classifyReferrer(host) → { channel: 'ai_assistant', source: 'chatgpt' | ... } | null`; single regex table |
| `lib/analytics/ai-crawlers.ts` | `classifyUserAgent(ua) → { bot, operator, purpose: 'training' | 'search' | 'user_fetch' } | null` |
| `lib/seo-metrics/csv-import.ts` | Parse GSC Gen-AI and Bing AI Performance exports → normalised rows |
| `lib/merchant/feed.ts` | Storefront products + Costings → Merchant Center feed rows |
| `lib/seo-content/fit-report.ts` | k-anonymised aggregates over Results for the fit report |

### Schema and data changes

- `seo_daily_metrics` — `(date, source, dimension, key, clicks, impressions, position_sum, extra jsonb)`. Unique on `(date, source, dimension, key)`. Stores `position_sum = avg_position × impressions` so rollups stay exact. `source` ∈ `gsc_web`, `gsc_genai`, `bing_ai`, `ga4`. `dimension` ∈ `total`, `query`, `page`, `country`, `device`.
- `ai_crawler_hits` — daily rollup `(date, bot, path_group, hits)`. Written via a buffered/fire-and-forget insert from `proxy.ts`, never blocking the response.
- `seo_annotations` — `(id, date, label, category, url, created_by)`.
- `seo_target_queries` — `(query, locale, intent, added_at, active)`. Seeded from `lib/seo/llms-index.ts` target queries.
- `seo_authority_snapshots` — `(date, provider, metric, value)`, e.g. Ahrefs DR.
- RLS: admin-only read; writes via service role only.
- Add terms to `CONTEXT.md` Marketing: **Search visibility snapshot**, **AI referral**, **AI crawler hit**, **SEO annotation**, **Target query**, **Content consolidation**, **Fit report**.

### Env

- `GOOGLE_SEARCH_CONSOLE_SITE_URL` (e.g. `sc-domain:mpillow.com` or `https://custom.mpillow.com/`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (or reuse the Gmail service-account pattern)
- `GA4_PROPERTY_ID` (optional slice)
- `AHREFS_API_KEY` (free key; required from 10 Aug 2026)
- `INDEXNOW_KEY`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (new GA4 property; see `GA4-SETUP.md`)

## Testing Decisions

Assert externally visible behaviour, not implementation.

| Module | Test |
|--------|------|
| `aggregate` | CTR = Σclicks/Σimpressions; position impression-weighted; deltas; empty periods |
| `ingest-gsc` | Idempotent upsert; 3-day re-fetch overwrites; pagination stops at short page |
| `ai-referrers` | chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai → ai_assistant; google.com → null |
| `ai-crawlers` | Known UAs classified with purpose; generic browsers → null |
| `csv-import` | Fixture exports from GSC Gen-AI and Bing parse to expected rows; bad headers rejected |
| `feed` | Price equals Costings sell price; no row for items without a truthful price |
| `fit-report` | Buckets below k are suppressed |

## Out of Scope

- Paid rank trackers / paid AI-visibility tools (Semrush, Ahrefs paid, Profound, Otterly)
- Querying LLMs directly to measure "share of voice" (costly, non-deterministic; revisit later)
- Paid search / Shopping ads
- Buying links, sponsored listicles without disclosure, or astroturfed Reddit posts
- Rewriting all ~90 posts — only consolidation targets are rewritten
- `zh-CN` content expansion
- BigQuery bulk export (revisit if row caps bite)

## Risks

- **Pruning risk:** removing pages that quietly earn long-tail clicks. Mitigation: decide keep/merge/prune only from ≥90 days of GSC page data, and 301 rather than delete wherever an equivalent exists.
- **Middleware cost:** crawler logging in `proxy.ts` must be non-blocking and rolled up. Sample if volume is high.
- **Attribution noise:** many AI referrals arrive with no referrer and look like Direct. Treat the AI channel as a floor, not a total.
- **Manual CSV gaps:** imports depend on someone doing them. Show a "last imported" date on the charts.

## Further Notes

See `issues/README.md` for the vertical slices and build order.
