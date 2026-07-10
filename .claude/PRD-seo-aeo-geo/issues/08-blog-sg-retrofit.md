# Slice 08 — Top 10 Singapore blog retrofit

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 18, 20

## What to build

- Add `seo_answer` to blog content type and blog post page display
- Retrofit top 10 Singapore-intent blog MDX files: add `##` headings where numbered sections exist
- Add answer lede display after H1 on blog post page (from seo_answer or description)
- Use `buildArticleJsonLd` with locale-correct URLs

## Target slugs

- what-is-the-best-pillow-for-neck-pain-in-singapore
- how-to-choose-the-best-pillow-in-singapore
- finding-the-perfect-neck-support-pillow-in-singapore
- neck-support-pillows-in-singapore-your-key-to-comfortable-sleep
- what-is-tech-neck-and-how-can-a-pillow-help-fix-it-in-singapore
- cervical-pillow-for-neck-pain-a-comprehensive-guide
- the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief
- top-5-pillows-for-neck-pain-relief-what-to-look-for-and-why-it-matters
- ergonomic-pillow-vs-regular-pillow-is-it-worth-the-investment
- the-complete-guide-to-choosing-the-right-bolster-in-singapore

## Acceptance criteria

- [ ] Blog post page shows answer lede when seo_answer or description present
- [ ] Blog JSON-LD uses locale-prefixed canonical URLs
- [ ] At least 5 target MDX files use semantic `##` headings
- [ ] Blog metadata includes canonical + hreflang

## Blocked by

Slice 01
