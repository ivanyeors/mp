# Slice 09 — /guides/ editorial hub pages (3 routes)

Type: AFK
Parent: PRD `seo-aeo-geo` (`.claude/PRD-seo-aeo-geo/seo-aeo-geo-prd.md`)
Triage: needs-triage
User stories covered: 23, 25, 26, 27, 28

## What to build

Three editorial hub routes under `app/[lang]/guides/[topic]/`:

| Route | Target query |
|-------|-------------|
| `/guides/neck-pain` | pillow for neck pain Singapore |
| `/guides/cervical-pillow` | best cervical pillow Singapore |
| `/guides/custom-pillow` | customised pillow Singapore |

Each hub: H1, answer lede, internal links (blogs, PDPs, mp-config/mbolster-config), FAQ section with FAQPage JSON-LD, generateMetadata. Content from i18n `m.guides.*`. Add routes to sitemap.

## Acceptance criteria

- [ ] Three guide pages render with answer lede + FAQ JSON-LD
- [ ] Commercial CTAs link to mp-config or mbolster-config (no duplicate commercial pages)
- [ ] Guide pages in sitemap.xml
- [ ] llms.txt links to guide URLs

## Blocked by

Slices 05, 06
