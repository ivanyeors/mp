# Slice 08 — Staging copy sign-off (mobile + desktop)

Type: HITL
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 42–43, 45–48

## What to build

Human sign-off on staging (or production preview) after slices 01–07:

- Desktop + ~375px mobile: home hero, Neck Pains → cervical (incl. new Tech Neck section), Mbolster card + slide-in, Premium/Basic, mp-config / mbolster-config shells, Page FAQ, Partners, Stories.
- Claim-safety read: no treat/cure; no invented bundles/fees.
- Persona weave check: Affluent on hero/Premium; Tech Neck on cervical path; Families on Mbolster only.
- Note any CMS overrides that still show pre-rewrite strings.
- Confirm llms.txt / robots not regressed.

## Acceptance criteria

- [ ] Sign-off checklist completed for desktop and mobile on listed surfaces. _(human)_
- [x] No claim-safety blockers remaining (or filed as follow-ups). _(auto: slices 01–07 + `assertMarketingCopySafe`)_
- [x] CMS override gaps documented if homepage still differs from i18n defaults. _(see below)_
- [x] Crawler surfaces still Science of Sleep–aligned. _(auto: `lib/seo/seo.check.ts`)_
- [ ] Product owner / marketing approver named in issue comment or checklist. _(human)_

## Branch for staging preview

`cursor/marketing-copy-slice-08-staging-signoff` — consolidates slices 01–07 (merges 01–03 + applied 04–07).

### Automated proof (2026-07-10)

```bash
npx tsx lib/i18n/marketing-copy-slice-01.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-02.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-03.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-04.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-05.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-06.check.ts  # ok
npx tsx lib/i18n/marketing-copy-slice-07.check.ts  # ok
npx tsx lib/seo/seo.check.ts                       # ok (Science of Sleep + tech neck query)
npx tsx lib/page-faq/page-faq.check.ts             # ok
```

Claim gate: `lib/i18n/assert-marketing-copy-safe.ts` (banned prescribe/treat/cure/rehab; hero copy-fit bands per CONTEXT.md).

### CMS / DB override gaps (defaults alone may not change live)

| Surface | Risk |
|---------|------|
| Home hero title/subtitle, Size Matters title/description | `landing_sections.content` can override i18n |
| Home ambassadors / credibility / review / founder / why-choose | same CMS overlay |
| Home Page FAQ | live `faq_page_items` until re-seed / Settings edit |
| Partners H1/subtitle | `partners_page` CMS row until cleared |
| seoAnswer, pick blurbs, Stories, slide-ins, mp-config / mbolster-config INTRO | i18n / page source (no CMS overlay for these) |

`robots.ts` still allows marketing URLs; documents `/llms.txt` discovery. Do not add commercial paths to disallow.

## HITL checklist (fill on staging)

**Approver:** _________________ **Date:** ________ **URL:** ________

### Desktop

- [ ] Home hero — Science of Sleep / cervical / Singapore; CTAs usable; lede not dominating
- [ ] Neck Pains → Cervical — Tech Neck section present; claim-safe
- [ ] Mbolster card + slide-in — household / kids–adults; no Family Bundle
- [ ] Premium / Basic slide-ins — consultative / FibreCool / Singapore cervical
- [ ] mp-config + mbolster-config INTRO shells
- [ ] Page FAQ — no Storefront jargon; cervical vs ergonomic + tech neck Qs
- [ ] Partners — clinical Singapore + chiro/physio/wellness; demo CTA; no voucher
- [ ] Stories — Singapore customers / neck comfort from i18n
- [ ] `/llms.txt` + robots sanity

### Mobile (~375px)

- [ ] Hero H1 / subtitle / CTAs above dock; lede clamped
- [ ] Neck Pains Learn More reachable
- [ ] Slide-ins: last sections not covered by sticky close; tap targets OK
- [ ] Same persona weave readable as desktop

### Claim / offer gate (spot-check)

- [ ] No treat / cure / prescribe / rehab
- [ ] No Family Bundle / workshop / fitting-fee / voucher invention

## Blocked by

- Slices 01–07
