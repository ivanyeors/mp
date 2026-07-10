# Slice 06 — Page FAQ + Partners Local Ambassador copy

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 28–32

## What to build

Cross-cutting buyer/clinical copy:

- Home Page FAQ defaults: rewrite what-is answer without Storefront jargon.
- Add FAQ: cervical vs ergonomic pillow (claim-safe).
- Add FAQ: customised pillow / tech neck strain at night (claim-safe; link mental model to cervical / mp-config).
- Partners `DEFAULT_WORK_WITH_US` en-US: H1/subtitle for clinical sleep support Singapore + chiro/physio/wellness; keep demo CTA; no voucher program.

## Acceptance criteria

- [x] Home Page FAQ what-is answer has no “Storefront product” jargon.
- [x] Two new buyer-prompt FAQs present with claim-safe answers.
- [x] Partners title/subtitle name Singapore + clinical audiences.
- [x] No invented referral voucher / Family Bundle language.
- [x] FAQ schema/render still works for home surface.

**DB note:** Defaults in `lib/page-faq/defaults.ts` + `DEFAULT_WORK_WITH_US`. Live `faq_page_items` / partners_page CMS rows may still show old copy until re-seeded or edited in Settings.

**Proof:** `npx tsx lib/i18n/marketing-copy-slice-06.check.ts`

## Blocked by

- Slice 02 — Neck Pains + Cervical Tech Neck section (Tech Neck FAQ should align with live cervical copy)
