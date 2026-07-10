# Slice 05 — Proof surfaces

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 11–15, 34

## What to build

Rewrite Affluent / proof en-US strings:

- Size Matters slide-in title → Science of Sleep — why size matters (keep body).
- Credibility tile descriptions → Science of Sleep / cervical fit / patented modular.
- Review subtitle → clinician review + customised cervical / neck pain / Singapore.
- Founder: add one measurement-led cervical fit paragraph (keep voice).
- Ambassadors landing: Consumer ambassador framing; point clinical partners to Our Partners.
- Why choose: optional section title “Engineered for Science of Sleep” + tighten card one-liners if keys exist.

## Acceptance criteria

- [x] Size Matters slide title brands Science of Sleep.
- [x] Credibility / review / founder / ambassadors copy match canvas Recommended intent.
- [x] Consumer ambassadors never labeled Local Ambassadors.
- [x] No new medical claims.
- [x] en-US only.

**Why choose note:** No section-title i18n key or H2 in `WhyChooseSection` (cards-only UI). Skipped adding a title key; tightened the five card one-liners instead (incl. modular replace-layers line).

**CMS note:** Defaults in `lib/i18n/messages/en-US.ts` only. Prod `landing_sections.content` overrides for home ambassadors / credibility / review / founder / why-choose may still show old strings until cleared/re-seeded. Size Matters slide title resolves from i18n.

**Proof:** `npx tsx lib/i18n/marketing-copy-slice-05.check.ts`

## Blocked by

- Slice 01 — Hero + Affluent Pain home stack
