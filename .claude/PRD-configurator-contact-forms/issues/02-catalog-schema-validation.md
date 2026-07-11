# Slice 02 — Catalog + schema: site_settings options, Result columns, validation + checks

Type: AFK
Parent: PRD `configurator-contact-forms` (`.claude/PRD-configurator-contact-forms/configurator-contact-forms-prd.md`)
Triage: needs-triage
User stories covered: 42, 45–48, 50–51

## What to build

Land the deep modules and persistence foundation used by Forms admin, preview contact, and Results detail.

- **Migration** on `mp_config_responses`: `customer_phone text`, `discovery_source text`, `discovery_source_other text`.
- **Discovery source catalog** module: load/save bilingual option list from `site_settings` JSON; seed defaults (including fixed system `other`); archive vs delete; resolve id → label; filter active options for public consumers.
- **Discovery source validation** module: required source id; if `other` then free text required (min length); reject unknown/inactive ids on submit.
- **APIs (minimal for this slice):** admin GET/PUT catalog gated by `page-builder`; public GET of active options (or shared lib ready for routes in 03/04). Prefer shipping the routes here so 03/04 are UI-only consumers.
- **Automated checks** (`*.check.ts`): catalog seed / Other lock / archive filtering; validation required + Other free-text rules.

No Forms UI, preview contact UI, or Results detail in this slice.

## Acceptance criteria

- [x] Migration adds `customer_phone`, `discovery_source`, `discovery_source_other` to `mp_config_responses`.
- [x] Catalog persists to `site_settings` with ordered options: `id`, `labels` (`en-US`, `zh-CN`), `active`, optional `system`.
- [x] Seed includes fixed `other` (system, not deletable) and a small starter list ops can edit later.
- [x] Active-only listing excludes archived options; label resolve still works for archived ids.
- [x] Validation rejects missing source, empty Other text when `other`, and unknown/inactive ids.
- [x] Admin mutate path requires page-builder; public read returns active options only.
- [x] Runnable checks pass for catalog + validation.

## Blocked by

None — can start immediately.

## Status

Done (2026-07-11). Prove: `npx tsx --env-file=.env.local lib/discovery-source/discovery-source.check.ts`
