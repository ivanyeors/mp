# Slice 04 — Preview contact block + hold/in-store persist (mp-config, mp-basic, mbolster)

Type: AFK
Parent: PRD `configurator-contact-forms` (`.claude/PRD-configurator-contact-forms/configurator-contact-forms-prd.md`)
Triage: needs-triage
User stories covered: 4–25, 43–44, 49

## What to build

End-to-end visitor path: required contact + Discovery source on preview, persisted on authorize and in-store save.

- Shared **preview contact fields** component: email, mobile, Discovery source select (“How did you hear about us?”), conditional Other free text; grouped contact-block polish only.
- Load active options from public catalog API; show locale-appropriate labels.
- Wire into Mpillow (`mp-config` / `mp-basic`) and Mbolster preview.
- Validate before Authorization hold and before Mpillow **Save without purchasing**; use existing phone normalize helper.
- Extend hold (and in-store upsert/finalize) to require and write `customer_phone`, `discovery_source`, `discovery_source_other`.

No Forms admin UI (slice 03) and no Results detail display (slice 05) in this slice — persistence must be verifiable via DB or API response.

## Acceptance criteria

- [x] Preview on mp-config, mp-basic, and mbolster-config shows required email, mobile, and Discovery source.
- [x] Other reveals required free text; non-Other hides/ignores free text for validation.
- [x] Invalid/missing fields block authorize with field-level errors (not toast-only).
- [x] Successful hold persists phone + Discovery source (+ Other text when applicable) on the Result.
- [x] Mpillow Save without purchasing requires and persists the same fields.
- [x] Phone is normalized via the existing SG-friendly helper when valid.
- [x] Welcome / measurement / customize steps are unchanged beyond consuming the shared preview block.

## Blocked by

- [`.claude/PRD-configurator-contact-forms/issues/02-catalog-schema-validation.md`](02-catalog-schema-validation.md)

## Status

Done (2026-07-11). Prove: `npx tsx lib/discovery-source/forms-preview-contact.check.ts` (+ hold/upsert route wiring). Staging HITL in slice 06.
