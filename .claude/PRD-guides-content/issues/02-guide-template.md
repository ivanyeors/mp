# Slice 02 — Guide template v2: Markdown source, layout, JSON-LD, checks

Type: AFK
Parent: PRD `guides-content`
Triage: needs-triage

## What to build

- Read `data/guides/<topic>.md` (frontmatter + body) at build time; zh-CN keeps `lib/seo/guides-content.ts` until D6's follow-up.
- Port today's three guides into Markdown **unchanged in substance**, so the slice is demoable before any rewrite.
- Build the layout in the PRD's "The shared layout" section, reusing:
  - the blog's breadcrumb, `extractHeadings` and `extractFaq`;
  - `PostBody` with a guide component map (figure, YouTube facade, see-a-doctor callout, decision-point CTA, tables that stack on phones);
  - topic reviews.
- JSON-LD: Article, BreadcrumbList, FAQPage, and VideoObject only when a video is present.
- Metadata: front-loaded title, description, per-guide OG image with fallback.
- `lib/seo/guides.check.ts` and `lib/seo/__tests__/guides-jsonld.test.ts` as specified in the PRD's Testing Decisions.
- Investigate the "Got it" chip overlapping content on phones (seen on `/guides/custom-pillow`). Fix it, or log it in `docs/known-issues.md` with the reason.

## Acceptance criteria

- [ ] `pnpm checks guides` passes on the ported content and fails on a fixture lede of 70 words, an H2 without "?", a "$" price and the word "cure".
- [ ] JSON-LD test passes; it fails if FAQPage drifts from the visible FAQ.
- [ ] Preview screenshots (desktop + phone) of all three guides sent to the owner.
- [ ] No React effect outside `hooks/` or `components/ui/`; lint clean.

## Blocked by

Slice 01 (D1 decides whether the blog hubs are linked as spokes or merged)
