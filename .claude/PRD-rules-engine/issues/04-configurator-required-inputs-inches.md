# Slice 04 — Configurator inputs: inches default, all required, no silent defaults

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: needs-triage
User stories covered: 20, 21, 22, 23

## What to build

The wizard's inputs become trustworthy engine inputs, end to end (`/mp-config`, `/mp-basic`, `/mbolster-config`).

- Measurement steps default to the **inches** tab (cm toggle stays; canonical storage stays cm — display conversion only).
- Every engine input required, driven by the flow's input catalog: 4 measurements (Premium), shoulder (Basic), height (Mbolster), plus sleep position, bed firmness, acid reflux, ear discomfort, blood pressure, pain areas, uses bolster, gender, age group where the flow collects them. Continue blocks on the incomplete step via the existing hybrid CTA pattern; measurement guides surface on blocked measurement steps.
- Pain areas multi-select gains an explicit **"None"** chip (mutually exclusive with other chips).
- Remove client-side silent defaults (`shoulderCm || 40`, neck 8/10/10): the ballpark request is only sent with a complete input set; the server rejects incomplete inputs rather than fabricating a Size M.
- Photos remain optional (operator review context, not an engine input).

## Acceptance criteria

- [x] Measurement steps open on inches; entered values round-trip correctly to canonical cm
- [x] Skipping any engine input blocks Continue on that step with field-level errors on submit; no recommendation request carries invented values
- [x] Pain areas requires an answer and "None" deselects other chips
- [x] Server-side customize/recommend endpoints reject incomplete input sets with a validation error
- [x] `*.check.ts` for required-input gating derived from the flow input catalog

## Proof (2026-07-19)

- `npx tsx lib/rules-engine/slice-04.check.ts` — ok
- `npx tsx lib/configurator/pain-areas.check.ts` — ok
- `npx tsx lib/configurator/measurement-draft.check.ts` — ok
- `npx tsx lib/configurator/height-draft.check.ts` — ok
- `npx tsx components/configurator/single-select-option-rows.check.ts` — ok
- `npx vitest run lib/rules-engine` — 13 passed

## Blocked by

- Slice 01 (input catalog is defined there). Slice 03 not required — gating works against legacy callers too.
