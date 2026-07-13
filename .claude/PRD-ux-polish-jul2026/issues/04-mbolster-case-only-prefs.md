# Slice 04 — Mbolster case-only preference + auto-select

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 5–8

## What to build

Align Mbolster customise with inventory/Configure: **Customer preference** is case only (`bolster_case`). Remove Cover Style picker and cover requirement from mbolster-config, hold payload, and API validation for bolster. Auto-select when exactly one eligible case is available. Protector stays BOM-owned (not a preference). Add automated preference-policy check.

## Acceptance criteria

- [x] Mbolster preview shows case picker; no Cover Style block.
- [x] Authorize does not require or send a cover preference line for bolster.
- [x] Exactly one eligible case → auto-selected.
- [x] Hold/API reject invalid cover-as-required for bolster.
- [x] Automated check for bolster preference policy.

## Proof (2026-07-13)

`caseOnly` on customization; hold sends case-only `preferenceLines`; API uses `preferenceCategoryAllowed`; sole case via `soleCaseId`.

```bash
npx tsx lib/configurator/preference-policy.check.ts
# → preference-policy self-check ok: bolster is case-only; sole case auto-selects
```
