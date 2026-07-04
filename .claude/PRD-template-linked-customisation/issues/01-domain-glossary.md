# Slice 01 — Domain glossary: tier, Result, Filling Template

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 41

## What to build

Lock domain language in `CONTEXT.md` and set the rule for all later slices: customer- and operator-facing copy uses **tier**, not kind.

- Replace **kind** with **tier** (basic | premium) for pillows; note bolsters use **length** only.
- Add **Result**, **Filling Template**, **Customer preference** (cover, case), **Add-on**, **Authorization hold**.
- Document relationships: Result links to composed sellable + Filling Template after assignment; final build = non-filling composed BOM + filling template lines + preferences + add-ons; accepted Result becomes Order after capture.
- Flag that protector is tier-owned, not a customer preference.
- Document that internal DB column names may still say `kind` / `pillow_kind` where migrations already exist; **UI, emails, and new API response field labels** exposed to humans use `tier`.

Later slices (05–07, 09–10) must satisfy the UI half of US41; this slice owns the glossary contract they implement against.

## Acceptance criteria

- [x] `CONTEXT.md` defines Tier, Result, Filling Template, Customer preference, Add-on, Authorization hold.
- [x] Glossary uses **tier**, not kind, for basic/premium; `_Avoid_: kind` is listed.
- [x] Relationships and an example dialogue cover operator assign → customer accept → Order.
- [x] Flagged ambiguities note kind → tier and template vs composed sellable vs storefront product.
- [x] Glossary states protector is tier-owned (not a customer preference) and fillings come from Filling Templates.

## Status

**Done** on `cursor/domain-glossary-tier-result` — commit `1f33793e` (`docs: lock tier/Result/Filling Template glossary in CONTEXT.md`).

Verified against PRD Domain language (§ Implementation Decisions) and US41 (glossary contract only; UI half lands in slices 05–07, 09–10).

## Blocked by

None - can start immediately.
