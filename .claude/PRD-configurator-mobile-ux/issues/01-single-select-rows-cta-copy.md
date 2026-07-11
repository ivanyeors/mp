# Slice 01 — Single-select rows + CTA copy

Type: AFK
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: needs-triage
User stories covered: 1–7, 21–23, 39–41, 48

## What to build

Replace Select dropdowns for gender, age group, blood pressure, and bed firmness on Mpillow full and basic configurators with cover-style full-width single-select option rows (same visual language as Cover Style). Keep pill chips for multi-select only.

Update primary CTA copy on the additional-questions / customize step:

- Full Mpillow: `Generate Results` → `Customise`
- Basic Mpillow: `See your Basic Mpillow` → `Continue`
- Mbolster: keep / use `Continue` for advance CTAs (no demographic fields added)

Ship a small shared option-row control (or reuse Cover Style button styling) so selection and later error styling stay consistent.

## Acceptance criteria

- [ ] Gender, age group, blood pressure, and bed firmness use single-select option rows on mp-config and mp-basic (all breakpoints).
- [ ] Only one option can be selected per question; tapping another option replaces the previous.
- [ ] Sleep pain / sleep position multi-select pill chips are unchanged.
- [ ] Mbolster does not gain gender/age/BP/bed firmness questions.
- [ ] Full Mpillow customize-step primary CTA reads `Customise`.
- [ ] Basic Mpillow equivalent primary CTA reads `Continue`.
- [ ] Mbolster advance CTAs read `Continue` where applicable.
- [ ] Yes/no Tabs (ear discomfort, acid reflux, uses bolster) unchanged.

## Blocked by

None — can start immediately.
