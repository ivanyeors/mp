# Slice 08 — Answer lede coverage audit + fill on commercial surfaces

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 4–10

## What to build

Treat “TL;DR” as **Answer lede** only — no new UI. Audit and fill gaps on commercial surfaces that also get Page FAQs:

- Homepage hero `seoAnswer` (i18n).
- Every active shop PDP `seo_answer` (product locale CMS) — ensure present and roughly 60–120 words where missing/weak.
- `mp-config` and `mbolster-config` SEO shell ledes.
- Document audit results briefly in the PRD folder or OPS note (which surfaces were filled).

No blog retrofit. No new summary component.

Demoable outcome: view source on home, a main PDP, and both configurators shows a real answer lede under/near H1.

## Acceptance criteria

- [x] Audit list of commercial surfaces completed (home, PDPs, both configs).
- [x] Missing/weak ledes filled in the existing CMS/i18n fields.
- [x] No new TL;DR component introduced.
- [x] Blogs / guides / slide-ins not required for this slice.

Proof: `npx tsx --env-file=.env.local lib/seo/answer-lede-coverage.check.ts` → `answer-lede-coverage self-check ok`

Audit note: `.claude/PRD-page-faq-embeds/OPS-ANSWER-LEDE.md`

## Blocked by

None - can start immediately
