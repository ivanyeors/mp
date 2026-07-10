# Slice 01 — Hero + Affluent Pain home stack

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 1–5, 35, 40, 44

## What to build

Apply canvas Recommended copy for Affluent Pain home surfaces in en-US i18n:

- Hero H1 parts (`titlePrefix` / `titleEmphasis` / `titleSuffix`) → Science of Sleep / cervical neck pain Singapore framing; keep Customise + Book appointment CTAs.
- Hero `seoAnswer` + `subtitle` → open with Science of Sleep + in-store measurement; modular cervical subtitle.
- Size Matters landing title/description → shoulder length → loft / measurement science.
- Pick your Mpillow Basic + Premium card blurbs → occasional tension vs chronic neck pain + consultative fit + cervical accessory path.

Do not invent fees or new offers. Leave CMS `landing_sections` overrides untouched; document if prod CMS may still show old strings.

## Acceptance criteria

- [x] Hero H1 no longer leads with gift framing; names cervical / neck pain / Singapore / Science of Sleep intent.
- [x] Answer lede still ~60–120 words, claim-safe, and visible (mobile clamp may apply).
- [x] Size Matters landing copy references measurement (shoulder → height), not only “handcrafted”.
- [x] Basic and Premium pick-card descriptions differentiate entry vs consultative chronic-pain path.
- [x] Customise + Book appointment CTAs unchanged in behavior.
- [x] en-US only; zh-CN untouched.

**CMS note:** Defaults in `lib/i18n/messages/en-US.ts` only. Prod `landing_sections.content` overrides for hero title/subtitle and Size Matters title/description are left alone — live homepage may still show old strings until CMS is cleared/re-seeded. `seoAnswer` and pick-card blurbs always resolve from i18n.

**Proof:** `npx tsx lib/i18n/marketing-copy-slice-01.check.ts`

## Blocked by

None - can start immediately
