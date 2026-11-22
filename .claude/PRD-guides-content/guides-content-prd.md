# PRD: Guide pages that answer, show and convert

Status: Ready to build. The owner answered decisions D1–D6 on 22 Nov 2026 (all as recommended); start at slice 00.
Source: research session, 21 Nov 2026; decision research, 22 Nov 2026. Evidence and sources: `research.md` (§11 holds the decision research). Page-by-page outlines: `page-blueprints.md`. Diagrams, video shot lists and ad copy: `media-plan.md` and `media/`.
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
3. **Byline row**: "By the Mpillow fitting team" · "Updated <date>" · "We make and fit these pillows" (the CPFTA disclosure, in plain words). The reviewer is not named here, next to the buttons: AHPC 5.7.2 says their part must not look like an endorsement. Their credit sits in the "About this guide" box (block 16).
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
16. **About this guide**: who wrote it, that we make and fit the pillows, who checked the health information and their declared relationship, and the last-checked date (D3). No button and no product photo in or next to it.
17. **Sources**: a numbered list, collapsed on phones.

On phones the order stays the same. Tables of three or more columns become one card per option. Figures run full width with the caption below. The phone layout has no sticky CTA bar, because a "Got it" chip already covers content (see slice 02).

## Owner decisions (answered 22 Nov 2026)

The owner took the recommended answer on each. The evidence is in `research.md` §11.

| # | Decision | Answer | Evidence | What it changes |
|---|---|---|---|---|
| D1 | Who owns each topic: guide or blog hub? | **The guides.** Each guide absorbs its blog hub's best sections. The hub 308s to the guide. Every redirect that pointed at a hub is repointed straight at the guide: 39 Shopify cutover rows and 27 earlier blog merges, plus the 3 hubs themselves, so 69 old URLs land in one hop. | Google treats a permanent redirect as "a strong signal that the target … should become canonical"; 301 and 308 count the same. Hubs earned no clicks on custom.mpillow.com (content audit); their value is the 39 inherited mpillow.com URLs, which move with the redirects. | Slice 06 grows: repoint `lib/shopify-redirects.ts` and `MERGED_BLOG_SLUGS`, update 14 posts that link to a hub, and amend 3 rows of the 17 Oct map in `content-audit.md`. |
| D2 | Claim wording | **Comfort and alignment.** Guides may name neck pain as the reader's problem, explain its causes and say when to see a doctor. The pillow's job is only ever support, alignment, comfort, fit, less strain and better sleep. Never "relieves / treats / cures", "pain-free", "corrects posture", "orthopaedic pillow", "clinically proven" or "doctor-recommended". | HSA GL-06 (Oct 2023): intended purpose is judged by "the way the product is designed and/or presented". Hot and cold packs are medical devices because they are "generally intended for pain relief", but not when labelled for warmth. A foot patch to "promote good sleep, to soothe or relax muscle" is not a medical device; "support for sprains or injuries" is. The statutory definition covers "alleviation of … an injury" and "support of the anatomy … mainly for medical purposes". | `persona.md` rule 2 and `.claude/rules/storefront-copy.md` drop "relief" and "posture". **D2b:** the risky strings already on the site (Premium "Who it's for", Cervical Neck Support benefits, one landing feature, and their zh-CN copies) are rewritten first, as slice 00, with a claims check over the message files. Blog posts get the same pass as follow-up slice 13. |
| D3 | Named clinical reviewer | **A partner physiotherapist, credited and disclosed.** They check the health facts only (causes, evidence, sleep positions, see-a-doctor signs), not the product sections. Their credit sits in "About this guide", with the commission declared. Their name and photo never appear in ads, next to a button or with the pillow. Until someone agrees, the byline is "Mpillow fitting team". | AHPC Code of Professional Conduct 5.7.2: a registrant may take part in "educational websites sponsored by companies marketing healthcare … products" but "must ensure that your participation does not occur in such a way as to appear to endorse such products, or persuade patients or members of the public to use the products. All potential conflicts of interest should be declared to the audience." Partner clinics earn Commission on referrals (`CONTEXT.md`, Partner portal), so the conflict is real. | The byline row loses "Reviewed by"; block 16, "About this guide", is added. Slice 09 carries the brief to send the physio and the box text. `WebPage.reviewedBy` and `lastReviewed` are emitted only when the check has happened. |
| D4 | Media | **In-house.** Claude drafts the diagrams as SVG in the site's style (first drafts in `media/`). Staff film three 60–90-second clips in the studio on a phone with a clip-on mic, from the shot lists in `media-plan.md`. The clips go to the Mpillow YouTube channel and are embedded in the guides with captions. | Google shows video results only where "video is the main content" of the page, so an embedded clip in a guide gets no video result; YouTube is the watch page. Google's AI guidance rewards first-hand content, not production polish. | Slices 07–08 no longer wait on a supplier. **VideoObject leaves the guide JSON-LD**: YouTube carries the video's own metadata. |
| D5 | Ads | **Guides take research searches only.** Research ad groups land on the guides; buying searches and brand terms land on `/mp-config`. Ad copy uses D2's wording. No remarketing list or Customer Match is built from guide visitors. "custom pillow" gets photo and print negatives. AI Max URL exclusions keep account, checkout and result pages out. | Google's personalised-ads policy lists Health as a sensitive interest category; when promoting in one, "your data segments" (remarketing) and Customer Match are not supported. The Misrepresentation policy bans "claims that entice the user with an improbable result". AI Max final URL expansion sends clicks to any page "predicted to perform best" unless URL exclusions stop it. | Slice 10 carries the ad groups, keywords, negatives, sample headlines and exclusions (`media-plan.md` §4). |
| D6 | zh-CN | **After English ships.** Today's short zh-CN guides stay until the English rewrites are live and the claims, diagrams and videos are settled. Then a fluent human reviewer translates them, and the SVG labels get Chinese versions. | Census 2020, Chinese residents: Mandarin is the most-spoken home language for 46% of 35–54-year-olds (English 46%) and for 46% of 55–74-year-olds (dialects 21%, English 32%). The audience is real, but translating twice during the build doubles the claim review. | Follow-up slice 12. |

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
- Frontmatter: `title` (meta), `description`, `h1`, `seo_answer`, `keywords`, `author`, `reviewer` (optional: name, role, organisation, relationship, url, `lastReviewed`), `datePublished`, `dateModified` (set by hand, and only for a real content change), `ogImage`, `heroImage`, `heroAlt`, `heroCaption`.
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
  - **Article**: headline, description, image, author (Organization "Mpillow"), publisher, `datePublished`, `dateModified`.
  - **BreadcrumbList**.
  - **FAQPage**: kept because it matches visible Q&A, though Google stopped the rich result on 7 May 2026. Bing says schema helps its AI parse pages.
  - No VideoObject (D4): an embedded clip is not the page's main content, so Google gives it no video result, and YouTube already describes the video. No Product, Review or rating markup on guides.
- `WebPage.reviewedBy` (Person: name, `jobTitle` "Physiotherapist", `worksFor`) and `lastReviewed` come from the frontmatter `reviewer` block, only once the physio has really checked that version (D3).

### Copy rules (in addition to `content-standard.md` and `persona.md`)

- **Claim wording (D2).** Neck pain is the reader's problem, never the product's promise. Say the pillow supports, aligns, fits, keeps the head level, reduces strain, and makes sleep more comfortable. Do not say it relieves, treats, cures, heals, fixes or corrects anything, or that it is pain-free, orthopaedic, clinically proven or doctor-recommended. Do not list medical conditions as who a product is for. Point people with a condition to their doctor. `media-plan.md` §5 has the allowed-and-banned table with examples.
- H1 is the question. Title and H1 may differ.
- Say "Mpillow" and "we" plainly: we make and fit these pillows.
- Use "the best pillow for neck pain" only to answer the question ("the best one is the one that keeps your head level…"), never to claim ours is best.
- No prices. Link `/shop`; Costings is the source of sell price.
- No numbers we cannot source. Figures from our own fittings appear only after the fit report (search-visibility slice 11) publishes them with k-anonymity. Until then the outline marks them as wanted.
- In-store fitting is Singapore only; always pair it with the online route.
- Children: no pillow under 12 months (AAP).
- **Alt text** describes the information ("Side sleeper on a pillow that is too high: the neck bends up toward the ceiling"), not "image of pillow".

### Media

See `research.md` §8 for the inventory and gaps. Placement per guide is in `page-blueprints.md`. Everything new is made in-house (D4):

- **Diagrams** are SVG files in `public/guides/`, drawn from the drafts in `.claude/PRD-guides-content/media/`, using site colours and Figtree. Each has a light and a dark version, or uses `currentColor`. One SVG per panel, with no words inside; captions are HTML text, so zh-CN needs no new artwork (D6).
- **Videos** are three 60–90-second clips (shot lists in `media-plan.md` §2), uploaded to the Mpillow YouTube channel with chapters and an edited caption file. They are embedded with the existing nocookie facade, and the steps are also written out in the text next to each one.
- Until a clip is uploaded, the guide ships without it and leaves out that figure rather than using a placeholder. It never keeps the third-party shoulder-width clip.

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
| `lib/claims.check.ts` (slice 00) over `lib/i18n/messages/*.ts`, and later `data/guides/*.md` | Any banned claim phrase from one shared list in `lib/claims.ts`. English: relieve/relief, pain-free, reduce(s) … pain, treat, cure, heal, fix your neck, correct(s) posture, rehab, prescribe, orthopaedic pillow, clinically proven, doctor-recommended, guaranteed, better breathing, Science of Sleep. Chinese: 缓解, 治疗, 治愈, 矫正, 止痛, 临床证明, 医生推荐, 呼吸更顺畅. A product's "who it's for" list naming a medical condition. The plausible wrong version it must fail is today's `cervicalNeckSupport.benefits`. |
| `lib/seo/guides.check.ts` over `data/guides/*.md` | Lede outside 40–60 words. Meta title over 50 characters. Description over 155. A body H2 (other than FAQ / Next step / Sources) not ending in "?". FAQ count outside 4–6. Any `[[cite:` marker. Any sentence over 25 words. Any price pattern (`S?\$\d`). Any phrase from `lib/claims.ts`. A `reviewer` block with no `lastReviewed`, or a reviewer named outside "About this guide". |
| Same check, links and media | An internal link to a route or blog slug that is missing, merged or retired (reuse the `blogSlugFate` logic). An image path not in `public/` or the Media library. An image with empty alt text. A YouTube ID not on our channel's list (catches the third-party shoulder-width clip). |
| `lib/seo/__tests__/guides-jsonld.test.ts` | JSON-LD is missing Article, BreadcrumbList or FAQPage. FAQPage questions differ from the visible FAQ. VideoObject is present (D4). `reviewedBy` is present without `lastReviewed`. |
| `lib/__tests__/blog-redirects.test.ts` (D1) | A merged hub still 200s. Any of the 69 old URLs takes two hops. A redirect target is itself redirected. A post links to a hub slug. |
| Preview | Desktop and phone screenshots of all three guides, read and sent to the owner. |
| Staging | Rich Results Test and URL Inspection on the staged build (HITL). |

## Out of Scope

- New guide topics or variant pages (fan-out pages are scaled-content abuse).
- Rewriting other blog posts beyond re-pointing their links and the claim pass (follow-up slice 13).
- Product or Review markup on guides.
- The fit report itself (search-visibility slice 11). Guides consume it once it exists.
- Full zh-CN guides: follow-up slice 12, after the English guides are live (D6).
- A watch page per video on our own site. YouTube is the watch page (D4).
- Running the ads. Slice 10 sets up the campaign structure and copy; spend is the owner's call.

## Risks

- **Merging the hubs (D1) briefly unsettles rankings.** The blog hubs had no clicks on custom.mpillow.com (content audit), so the downside is small. Ship each merge with its guide, not before.
- **Claim drift.** A writer, a translator or AI Max rewrites copy into a medical claim. The shared claims list in `lib/claims.ts` and its checks guard the site. For ads, AI Max text customisation is reviewed against `media-plan.md` §5 weekly.
- **In-house media quality.** Phone footage can look amateur. The shot lists fix framing, light and sound. Each clip is reviewed in the preview before it is embedded, and a weak clip waits rather than ships.
- **Reviewer availability and the conflict (D3).** The byline falls back to the fitting team, and nothing invents a credential. The partner's commission is declared in the box; if the physio declines to be named with it, use slice 09's fallback (an independent physio for a flat fee).
- **HSA could still disagree.** The wording follows GL-06's own examples, but only HSA can classify a product. If the owner ever wants a pain-relief claim, use HSA's "Is my product a medical device?" tool and a written enquiry first.
- **Evidence ages.** Every guide carries `dateModified` and a 12-month review. The check warns when `dateModified` is older than 365 days.

## Further Notes

Slices and order: `issues/README.md`.
