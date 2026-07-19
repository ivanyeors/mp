# Slice 05 — Preview recommendation display + assign hint upgrade

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: done
User stories covered: 24, 25, 26, 27, 28, 29

## What to build

The engine's answer becomes visible — to the shopper on the completed preview, and to the operator at assign.

- Completed "Your Custom Mpillow" / basic / bolster preview shows: recommended size (or length) badge, plain-language **why** derived from the fired path (e.g. "Broad shoulders + side sleeping → Size L"), and the recommended **Filling Template** as a text mix summary (template name + flattened item × qty lines) with *recommended — our specialists confirm every build* copy.
- **Reveal gate**: the recommendation renders only when all required inputs are answered and any Flow route is resolved (slice 06). Mid-wizard steps never show partial recommendations.
- Admin Panel **Result** assign: the filling hint upgrades from the size's **Default Filling Template** to the engine-recommended template, showing the trace why; operator must still actively confirm (existing rule). Size×tier changes at assign clear to the new size's default hint as today.
- **Staff assist** precedence unchanged: an assist-supplied mix at hold create wins; the recommendation record is retained alongside for analytics.
- Vitest: reveal-gate logic; assign-hint source selection (engine recommendation vs Default FT vs assist mix).

## Acceptance criteria

- [x] Completing all inputs reveals size + why + recommended mix summary on the preview; an incomplete route shows no recommendation anywhere
- [x] The why copy names actual answers (measurement band, sleep position), not internal node ids
- [x] Assign page shows the engine-recommended template as the hint with its why; confirming writes the same rows as today
- [x] When Staff assist supplied a mix, the Result shows the assist mix as truth and the engine recommendation as reference only
- [x] `*.check.ts` for preview reveal gating

## Proof (2026-07-19)

- `npx vitest run lib/rules-engine` — includes slice-05 tests
- `npx tsx lib/rules-engine/slice-05.check.ts` — ok
- Base: merge of slices 03 + 04 on `feat/rules-engine-slice-05`

## Blocked by

- Slice 03 (recommendation record must exist)
- Slice 04 (required inputs make the reveal gate meaningful)
