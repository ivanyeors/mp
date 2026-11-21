# PRD: Guide pages that answer, show and convert

Status: Draft, waiting on the owner decisions below (needs-triage)
Source: research session, 21 Nov 2026. Evidence and sources: `research.md`. Page-by-page outlines: `page-blueprints.md`.
Builds on: `PRD-seo-aeo-geo` slice 09 (created the hubs), `PRD-search-visibility` slices 10–12 (consolidation, fit report, review quotes), `PRD-page-faq-embeds`.
Pages: `/guides/neck-pain`, `/guides/cervical-pillow`, `/guides/custom-pillow`.

## Problem Statement

The three guides are the pages Singapore searchers, AI answers and ad clicks land on for our three money topics. Today each one is about 150 words of text:

- no images, video, breadcrumb, table of contents, byline, updated date or sources;
- meta titles open with "A guide to…", so the search words come late;
- the "Related reading" links look like plain text.

Three things make this urgent:

1. **They inherited long articles.** At cutover, four mpillow.com articles of 1,340–1,746 words (an evidence-based neck pain guide, a pillow systematic review, "what is a cervical pillow", "why customised pillows") were redirected to these pages. A long page redirected to a thin one reads as a soft 404, so the rankings those URLs earned are at risk.
2. **They compete with our own blog.** Three rewritten blog hubs (1,700–2,500 words) target the same searches. `/blog/what-is-the-best-pillow-for-neck-pain-in-singapore` and `/guides/neck-pain` even share a title. Google now treats substantially similar pages as doorway abuse.
3. **Search has moved.** Google's 2026 AI guide rewards "non-commodity" content (first-hand, expert, beyond common knowledge). FAQ rich results ended on 7 May 2026, and AI answers take clicks from generic pages. Singapore's top results are affiliate listicles with no diagrams, video, clinician or sources, so there is room for a page that has them.

## Solution

Each guide becomes **the one page for its topic**:

- It answers the question in its first 60 words.
- It shows how fit works with our own diagrams, photos and video.
- It is honest about what a pillow can and cannot do, with cited evidence and "see a doctor if" signs.
- It ends at a measured fitting, online or in our Singapore studio.

Every guide follows one shared layout. Content moves from a TypeScript object to one Markdown file per guide, so it can be written, reviewed and checked like a blog post.

### The three intents (kept distinct)

| Guide | Searcher's question | Main query | Page's job |
|---|---|---|---|
| Neck pain | "What pillow should I get for my neck?" | pillow for neck pain singapore | Diagnose the pillow's part in neck pain, explain height by sleep position, compare pillow types, route to a fitting |
| Cervical pillow | "Is a cervical pillow right for me?" | cervical pillow singapore | Explain what one is, the honest evidence, who it suits, how to choose, and our cervical neck support |
| Custom pillow | "How does a made-to-measure pillow work, and is it worth it?" | custom pillow fitting singapore | Explain what is customised, the fitting steps, at-home vs studio, Basic vs Premium |

### The shared layout

One column of body text about 65 characters wide, with figures and tables allowed to run wider (up to about 960 px) on desktop. Top to bottom:

1. **Breadcrumb**: Home › Guides › Topic.
2. **H1**: the searcher's question, keyword first.
3. **Byline row**: "By the Mpillow fitting team · Reviewed by …" (if decision D3 lands) · "Updated <date>" · "We make and fit these pillows" (the CPFTA disclosure, in plain words).
4. **Short answer**: the Answer lede (40–60 words) in a lightly shaded block. Per `CONTEXT.md` this is the same field restyled, not a second TL;DR.
5. **Two actions**: "Find your size online" (`/mp-config`) and "Book a fitting in Singapore" (`/appointments?type=customisation`). These carry the ad-landing CTA above the fold.
6. **Hero figure**: the page's key diagram, with a caption.
7. **On this page**: an inline list of the H2s. Not sticky.
8. **Body sections**, each an H2 question that opens with a 1–2 sentence answer, then detail. Each section gets one visual (diagram, photo, table or checklist), with a break every 300–400 words.
9. **Decision-point CTA**: a sentence plus a button, written like content, placed after the comparison table.
10. **"How Mpillow fits…" section**: real photos, the steps in text, and the video (YouTube facade) inside the section it demonstrates.
11. **What customers say**: the existing topic reviews (slice 12).
12. **"When should you see a doctor?"**: a neutral callout with the red flags, and no CTA inside it.
13. **Frequently asked questions**: 4–6, as an accordion.
14. **Next step**: one CTA band.
15. **Related guides**: the other two guides as cards with thumbnails, then 2–3 blog spokes.
16. **Sources**: a numbered list, collapsed on phones.

On phones the order stays the same. Tables of three or more columns become one card per option. Figures run full width with the caption below. The phone layout has no sticky CTA bar, because a "Got it" chip already covers content (see slice 02).

## Owner decisions needed

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | What happens to the three blog hubs that compete with the guides? | **Merge each into its guide.** The guide absorbs the hub's best sections; the hub's slug 308s to the guide; chains are flattened in `lib/blog-redirects.ts`. This amends the 17 Oct consolidation map. | One page per intent is this repo's own rule (search-visibility story 24). The guides already hold the footer links, llms.txt entries, cutover redirects and ad landings. The alternative, retitling the hubs to narrower questions, keeps two long pages fighting for the same words. |
| D2 | Claim wording | Guides say **support, alignment, comfort, fit, reduce strain**. They never say "relieves/treats/cures neck pain", "corrects posture", "orthopaedic" as a claim, "clinically proven" or "doctor-recommended". Ask HSA ("Is my product a medical device?") before any pain-relief claim anywhere, then update rule 2 in `persona.md`. | HSA judges a product by how it is presented. "Relief" is the word most likely to make a pillow a medical device. `persona.md` currently allows "neck pain relief". |
| D3 | Named clinical reviewer | Ask a clinical partner (physio) to check each guide for accuracy. Credit them as "Checked for accuracy by <name>, physiotherapist, <clinic>, our clinical partner". Until then, byline "Mpillow fitting team" plus an "About this guide" note. | Trust is the biggest E-E-A-T signal on health pages. But SCAP, HSA GN-08 and the AHPC code limit professional endorsements, so this is an accuracy check, not a recommendation, and the relationship must be disclosed. |
| D4 | Media budget | Commission one diagram set (alignment, 6 panels; pillow types) and shoot three short videos (measure at home, studio fitting, cervical insert). | These are the gaps every competitor shares, and they are what an AI summary cannot replace. |
| D5 | Ads | Guides take informational keywords. Transactional keywords go to `/mp-config` (or a later noindexed variant). Add the "custom pillow" negatives in `research.md` §5, and keep guides claim-safe because AI Max can land traffic on them. | Message match; claim risk. |
| D6 | zh-CN | Keep today's short zh-CN guides until the en-US rewrites ship, then translate in a follow-up. | `PRD-search-visibility` puts zh-CN expansion out of scope. |

## User Stories

1. As a searcher with a stiff neck, I want the answer in the first lines, so that I know in seconds whether the page helps.
2. As a searcher, I want to see what "too high", "too low" and "about right" look like for my sleep position, so that I can judge my own pillow.
3. As a side sleeper, I want to know my height comes from my shoulder width, and how to measure it, so that I understand why one size fails me.
4. As a sceptical buyer, I want to know what the research does and does not show, so that I trust the page more than a listicle.
5. As a buyer comparing options, I want off-the-shelf, adjustable and fitted pillows compared side by side, so that I can choose without reading every section.
6. As a buyer, I want to see the real fitting (photos and a short video), so that I know what happens before I book.
7. As a buyer, I want Basic and Premium and at-home vs studio laid out plainly, so that I pick the right route.
8. As a reader with worrying symptoms, I want clear "see a doctor if" signs, so that a pillow page never delays care.
9. As a phone reader, I want short paragraphs, tables that stack and a contents list, so that I can scan and jump.
10. As a screen-reader or keyboard user, I want real headings, alt text, captioned video and a focusable accordion, so that the page works for me.
11. As an overseas reader, I want to know in-store fitting is Singapore only and how to measure online, so that I am not misled.
12. As a searcher after a printed photo pillow, I want to be told early that this page is about fitted pillows, so that I leave quickly instead of feeling misled.
13. As Google or an AI assistant, I want self-contained question sections, cited facts, our own data and visible dates, so that I can quote the page accurately.
14. As Google, I want each guide to serve one intent and the blog to stop duplicating it, so that I know which page to rank.
15. As an ads manager, I want the guide's H1 and first CTA to match the ad, so that landing-page experience scores well.
16. As the owner, I want guide copy checked automatically for banned claims, sentence length, lede length and broken links, so that a rewrite cannot ship a medical claim or a dead link.
17. As a marketer, I want guides edited as Markdown files with the same anatomy as blog posts, so that writing them does not need code changes.
18. As the owner, I want every guide to say who wrote it and that we make the pillow, so that it meets the CPFTA rule on promotional content presented as editorial.

## Implementation Decisions

### Content source

- One Markdown file per guide: `data/guides/<topic>.md` (en-US). zh-CN stays in `lib/seo/guides-content.ts` until D6's follow-up; then `data/guides/<topic>.zh-CN.md`.
- Frontmatter: `title` (meta), `description`, `h1`, `seo_answer`, `keywords`, `author`, `reviewer` (optional: name, role, organisation, relationship, url), `datePublished`, `dateModified` (set by hand, and only for a real content change), `ogImage`, `heroImage`, `heroAlt`, `heroCaption`.
- The body follows `content-standard.md`'s anatomy (question H2s, `## Frequently asked questions`, `## Next step`) plus a `## Sources` list. It reuses `extractHeadings` and `extractFaq` from `lib/blog-structure.ts`, and `PostBody` with a guide component map:
  - An image whose Markdown title is set renders as a figure with that caption, through `next/image` with real dimensions.
  - A paragraph that is only a YouTube URL renders the existing facade (`youtube-autoplay-on-view`) with its caption.
  - A blockquote starting "**See a doctor**" renders the red-flags callout.
  - A blockquote starting "**Next:**" renders the decision-point CTA.
  - GFM tables stack to cards below `md`.
- `ponytail:` the Markdown conventions above are the whole component vocabulary. If a fourth block type is needed, switch the guides to `format: "mdx"` with an allowlist.
- FAQ lives in the Markdown, not the Page FAQ store. Guides are code-owned editorial, like blog posts. Update **Page FAQ** and **Editorial hub** in `CONTEXT.md` to say so.

### Metadata and structured data

- Meta title ≤50 characters before the " | Mpillow" template, keyword first. Description ≤155 characters, different from the lede. A per-guide OG image at 1200×630.
- JSON-LD:
  - **Article**: headline, description, image, author (Organization "Mpillow", or Person with url if D3), publisher, `datePublished`, `dateModified`.
  - **BreadcrumbList**.
  - **FAQPage**: kept because it matches visible Q&A, though Google stopped the rich result on 7 May 2026. Bing says schema helps its AI parse pages.
  - **VideoObject** for the embedded video (name, description, thumbnailUrl, uploadDate, embedUrl). No Product, Review or rating markup on guides.
- If D3 lands, add `WebPage.reviewedBy` and `lastReviewed`, only for a review that really happened.

### Copy rules (in addition to `content-standard.md` and `persona.md`)

- H1 is the question. Title and H1 may differ.
- Say "Mpillow" and "we" plainly: we make and fit these pillows.
- Use "the best pillow for neck pain" only to answer the question ("the best one is the one that keeps your head level…"), never to claim ours is best.
- No prices. Link `/shop`; Costings is the source of sell price.
- No numbers we cannot source. Figures from our own fittings appear only after the fit report (search-visibility slice 11) publishes them with k-anonymity. Until then the outline marks them as wanted.
- In-store fitting is Singapore only; always pair it with the online route.
- Children: no pillow under 12 months (AAP).
- **Alt text** describes the information ("Side sleeper on a pillow that is too high: the neck bends up toward the ceiling"), not "image of pillow".

### Media

See `research.md` §8 for the inventory and gaps. Placement per guide is in `page-blueprints.md`. Until a commissioned diagram arrives, a guide ships with the existing images and leaves out the section's figure rather than using a placeholder.

### Measurement

- Add target queries to `seo_target_queries`:
  - pillow for neck pain singapore
  - best pillow for neck pain singapore
  - cervical pillow singapore
  - best cervical pillow singapore
  - custom pillow for neck pain singapore
  - pillow fitting singapore
  - customised pillow singapore
- One `seo_annotations` row per guide publish and per redirect batch.
- Compare 8 weeks before and after, per guide, from `seo_daily_metrics`: clicks, impressions, position; AI-assistant referrals (`analytics_visits`); and guide → `/mp-config` start, appointment booking and order.
- Ping IndexNow on publish (already wired).

## Testing Decisions

Done means checked. Each check fails the plausible wrong version.

| Check | Fails when |
|---|---|
| `lib/seo/guides.check.ts` over `data/guides/*.md` | Lede outside 40–60 words. Meta title over 50 characters. Description over 155. A body H2 (other than FAQ / Next step / Sources) not ending in "?". FAQ count outside 4–6. Any `[[cite:` marker. Any sentence over 25 words. Any price pattern (`S?\$\d`). Any banned claim phrase: cure, treat, heal, fix your neck, prescribe, rehab, relieves/relief (as a product claim), clinically proven, doctor-recommended, guaranteed, Science of Sleep. |
| Same check, links and media | An internal link to a route or blog slug that is missing, merged or retired (reuse the `blogSlugFate` logic). An image path not in `public/` or the Media library. An image with empty alt text. |
| `lib/seo/__tests__/guides-jsonld.test.ts` | JSON-LD is missing Article, BreadcrumbList or FAQPage. FAQPage questions differ from the visible FAQ. VideoObject is present with no video on the page. |
| `lib/__tests__/blog-redirects.test.ts` (D1) | A merged hub still 200s, a chain is two hops, or a post links to a hub slug. |
| Preview | Desktop and phone screenshots of all three guides, read and sent to the owner. |
| Staging | Rich Results Test and URL Inspection on the staged build (HITL). |

## Out of Scope

- New guide topics or variant pages (fan-out pages are scaled-content abuse).
- Rewriting other blog posts beyond re-pointing their links.
- Product or Review markup on guides.
- The fit report itself (search-visibility slice 11). Guides consume it once it exists.
- Fixing claim wording on the Premium and Cervical Neck Support slide-ins. That is listed in `research.md` §6 as a follow-up for the owner.

## Risks

- **Merging the hubs (D1) briefly unsettles rankings.** The blog hubs had no clicks on custom.mpillow.com (content audit), so the downside is small. Ship each merge with its guide, not before.
- **Claim drift.** A writer or AI Max rewrites copy into a medical claim. The banned-phrase check and D2 guard it.
- **Media lag.** Commissioned diagrams and videos take weeks. Guides ship text-first with existing images; slices 07–08 swap media in.
- **Reviewer availability (D3).** The byline falls back to the fitting team; nothing invents a credential.
- **Evidence ages.** Every guide carries `dateModified` and a 12-month review. The check warns when `dateModified` is older than 365 days.

## Further Notes

Slices and order: `issues/README.md`.
