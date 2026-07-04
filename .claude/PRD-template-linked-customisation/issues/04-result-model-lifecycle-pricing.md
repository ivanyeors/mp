# Slice 04 — Result model + lifecycle + pricing modules

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 28, 36, 37, 38, 39, 40

## What to build

Schema and deep modules for Results, builds, and pricing — no full customer UI yet.

- Extend Result storage with product type, suggested/assigned size×tier or length, `filling_template_id`, preference lines (cover/case item ids only), add-on lines, shipping snapshot, amounts, payment intent id (**nullable** for in-store review-only Results), status, `order_id`, and `proposed_*` LLM hooks.
- Support Results **with** and **without** a payment hold (in-store measurement-only uses no PaymentIntent; online purchase uses hold). Lifecycle must allow assign on both; capture only when a hold exists.
- **`build-assembly`**: final lines = composed sellable **non-filling** BOM lines (packaging, protector, and any other non-filling defaults) + Filling Template filling lines + customer preference lines (cover, case only) + add-on lines; COGS from Costings. Must **not** take protector from customer preferences. Must **not** include fillings from the composed sellable live BOM when a Filling Template is supplied.
- **`result-pricing`**: authorized/final totals from composed sellable MSRP + preference/add-on MSRPs + shipping + tax; fillings never change sell price.
- **`result-lifecycle`**: legal status transitions and invariants (assign requires Filling Template; capture requires Accept and a payment intent; decline/expire release hold when present; review-only Results can be assigned without capture).
- Unit tests for the three modules.

## Acceptance criteria

- [x] Migration adds Result fields (or linked table) including `proposed_*` hooks, nullable payment intent, preference/add-on line storage, and statuses needed by the PRD.
- [x] `build-assembly` takes non-filling lines (including protector) only from the composed sellable BOM for the assigned size×tier / length.
- [x] `build-assembly` takes filling lines only from the Filling Template, not from hardcoded recipes or customer input.
- [x] `build-assembly` accepts preference lines for cover/case only and rejects protector as a preference.
- [x] `build-assembly` rejects invalid filling templates (non-filling lines).
- [x] `result-pricing` matches Costings; filling lines do not alter sell total; shipping/tax included when provided.
- [x] `result-lifecycle` rejects illegal transitions; assign requires Filling Template; capture is impossible without Accept and a payment intent (behavior tests).
- [x] Lifecycle allows assignment on a Result with no payment intent (in-store review-only).
- [x] No customer-facing payment UI required in this slice (modules + schema only).

## Status

**Done** on `cursor/domain-glossary-tier-result`.

- Migration `0044_results.sql`: extends `mp_config_responses` with product type, suggested/assigned size×tier/length, `filling_template_id`, preference/addon lines, shipping snapshot, amounts, nullable `payment_intent_id`, status, `proposed_*` hooks (`order_id` already present)
- Modules: `lib/build-assembly`, `lib/result-pricing`, `lib/result-lifecycle` + unit tests
- No customer payment UI (slice 05+)

## Blocked by

- Slice 01 (glossary)
- Slice 02 (Filling Templates exist to reference)
