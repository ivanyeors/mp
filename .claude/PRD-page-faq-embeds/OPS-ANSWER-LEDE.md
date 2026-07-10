# OPS — Answer lede coverage (Slice 08)

Parent: `.claude/PRD-page-faq-embeds/issues/08-answer-lede-coverage.md`

## Audit (2026-07-10)

| Surface | Before | After |
|---------|--------|-------|
| Home `home.hero.seoAnswer` (en-US / zh-CN) | Present but short (~40 EN words / thin ZH) | Expanded to ~60–70 EN words / denser ZH |
| `mp-config` SEO shell lede | Present but short; ZH thin | Expanded bilingual ledes in page INTRO |
| `mbolster-config` SEO shell lede | Present but short; ZH thin | Expanded bilingual ledes in page INTRO |
| Active PDPs (`mpillow-basic`, `mpillow-premium`, `mbolster`) | **Missing** `seo_answer` — fell back to short `seo_description` | Filled bilingual `seo_answer` in product CMS |
| New inventory-sync inserts | No `seo_answer` on create | Defaults include bilingual `seo_answer` |

No blog / guide / slide-in retrofit (out of scope). No new TL;DR UI — still Answer lede only.

## Proof

```bash
npx tsx --env-file=.env.local lib/seo/answer-lede-coverage.check.ts
```

Expected: `answer-lede-coverage self-check ok`

## Demo (view source)

- `/en-US` — hero paragraph under H1 = `seoAnswer`
- `/en-US/shop/mpillow-basic` — answer lede under product H1 from `seo_answer`
- `/en-US/mp-config` and `/en-US/mbolster-config` — lede under H1 in SEO intro
