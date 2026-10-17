# Blog content standard

Every new or rewritten blog post follows this standard. It is the brief for slice 10's rewrites and for every later post (slice 09 asks for it). The post map is in `content-audit.md`.

## The one rule

Every page must say something only Mpillow can say: how the fitting works, what the modular build allows, what our clinical partners told us. Generic advice any pillow brand could publish is not enough on its own. Never invent a fact to get there. If a number, quote or statistic is not in a source we can point to, leave it out and list it as wanted.

## File format

Posts live in `data/blogs/<slug>.mdx` and are synced to `blog_posts.content["en-US"]`.

```markdown
---
title: "Question-led title, ideally ≤60 characters"
description: "Meta description, ≤155 characters, different from the answer lede"
seo_answer: "60–120 word direct answer. Renders under the title and is what AI answers quote."
keywords: ["main query", "secondary query"]
author: "Mpillow"
datePublished: "<unchanged>"
image: "<unchanged>"
slug: "<unchanged>"
---

Body in plain Markdown.
```

- The slug never changes. Published URLs move only through `lib/blog-redirects.ts`.
- `author` is "Mpillow" unless a named person wrote or reviewed it. Never put a person's name on text they did not write.

## Anatomy

1. **Title (H1)**: the main search question in plain words.
2. **Answer lede** (`seo_answer`): answers the title in 60–120 words. The body does not repeat it.
3. **Opening**: 2–3 sentences on how the reader feels (stiff neck, restless nights), then what the page covers. Spokes link to their hub here.
4. **Question H2s**: each `##` is a question people search. It opens with a 1–2 sentence direct answer, then the detail. Use `###` for sub-points.
5. **Short paragraphs**: 3–4 phone lines at most, one idea each.
6. **A break every 300–400 words**: a table, list or short callout.
7. **Comparison tables** for any "vs" or options content: rows are options, columns are what readers compare.
8. **`## Frequently asked questions`** with 4–6 `### Question?` subheadings, each answered in 1–3 self-contained sentences. This section becomes FAQPage schema, so keep the heading exactly as written.
9. **`## Next step`**: one clear call to action, either a configurator or a fitting.

The page adds the table of contents and the Related reading box itself. Do not write either.

Length: hubs 1,800–2,800 words, spokes 1,000–1,800 words. Stop when the question is answered.

## Linking

- Internal links are root-relative with no locale (`/blog/<slug>`, `/mp-config`). The page adds the reader's locale.
- A hub links to every one of its spokes. A spoke links up to its hub in the opening (and may name it again near the end without a second link), and across to 2–3 siblings.
- Each page has one commercial link, two at most: `/mp-config`, `/mbolster-config`, `/shop` or a `/guides/` page.
- Anchor text is 2–6 descriptive words, never "click here". Each URL is linked once in the body.
- Link only to live posts and real routes. `lib/__tests__/blog-redirects.test.ts` fails on a link to a merged, retired or missing post.

## Claims and sources

- **No treat or cure claims.** Say a pillow "can reduce strain" or "supports alignment", never that it fixes a condition. Persistent pain, numbness, tingling, weakness, or pain after an injury means seeing a doctor or physiotherapist, and the page says so.
- **Every health or sleep claim cites 1–3 sources** with an inline link. Use primary or authoritative sources (NHS, NIH/PubMed, Mayo Clinic, HealthHub Singapore, HPB, AASM, ACOG, AAP) and open the page you cite. A search snippet is not a source.
- **A draft may mark a claim it could not source yet** as `[[cite: the claim | candidate URL]]` right after the sentence. The post-body test fails while any marker remains, so a draft cannot ship until each one is replaced by a real link or the claim is cut.
- **Mpillow facts** come only from the brand fact sheet, the site's own copy or staff. No prices: they live in Costings and change, so link to `/shop` instead.
- **Children:** no pillow for babies under 12 months, per AAP safe-sleep guidance.

## Voice

- British/Singapore spelling, as the site uses: customise, centre, colour.
- Plain words. Sentences under 25 words. No filler openers ("In today's fast-paced world"), no "game-changer", no "Whether you're a side sleeper or…".
- Name the subject in every section (no "as mentioned above"), so any section can be quoted on its own.
- Use the Singapore angle where it is real: humidity, HDB bedrooms, bolster habits. Do not force it.
- Write new sentences. These posts also exist on mpillow.com, so copied text keeps them duplicates.

## Before publishing

- [ ] Answer lede answers the title; description ≤155 characters
- [ ] Every H2 is a question and opens with a direct answer
- [ ] At least one fact only Mpillow can state, with nothing invented
- [ ] Health claims cite a source and avoid treat/cure wording
- [ ] Links: hub, 2–3 siblings, one commercial page, only live slugs
- [ ] FAQ section in the exact format above
- [ ] `pnpm vitest run lib/__tests__/blog-redirects.test.ts components/blog` passes
