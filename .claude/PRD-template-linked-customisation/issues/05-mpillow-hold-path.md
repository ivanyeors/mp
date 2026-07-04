# Slice 05 — Mpillow hold path (mp-config → auth hold → Result held)

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 3, 5, 6, 7, 8, 9, 10, 20, 41, 43

## What to build

End-to-end **online** pillow purchase path from mp-config to a **held** Result with Stripe authorization (no capture). In-store measurement-only (no hold) is slice 13.

- Online mp-config purchase path: measurements/preferences, **cover and case preferences** (stored on Result), accessory **add-ons** (stored on Result), address, shipping method.
- Customer UI must **not** offer filling picking or protector picking (protector comes from tier via composed sellable later at assign).
- Ballpark size×tier suggestion for hold amount via `result-pricing` (user-visible label: **tier**, not kind).
- Create Stripe PaymentIntent with manual capture (`authorization-hold` module).
- Persist Result in `held` with payment intent id, preference lines, add-on lines, shipping snapshot, authorized amount.
- Customer can open Result status page (pending review): via email/magic link and, if logged in, from an **account** Results/orders area.
- Telegram notify to ops with platform link (notify only).
- Do not reserve or deduct inventory on hold.
- **mp-maker is unchanged** in this PRD (no hold/assign wiring on mp-maker).
- Write ADR: authorize-then-capture for customised goods.

## Acceptance criteria

- [x] Completing **online** mp-config purchase path creates a Result in `held` with authorized amount including base MSRP + prefs/add-ons + shipping + tax.
- [x] Result stores selected cover and case preference item ids (customer preferences).
- [x] Result stores selected accessory add-on item ids and quantities.
- [x] Customer-facing flow has no control to pick fillings or protector.
- [x] Stripe shows an uncaptured PaymentIntent (manual capture); customer is not charged yet.
- [x] Status page shows pending review (no Accept until assigned — Accept lands in slice 07).
- [x] Guest can open the status page via email or magic link.
- [x] Logged-in customer can open the same Result from an account area (list or detail).
- [x] Operators receive Telegram with link to the Result on the platform.
- [x] Inventory balances unchanged after hold (no reserve, no deduct).
- [x] Customer-visible copy uses **tier** (not kind) for basic/premium.
- [x] mp-maker routes and behavior are unchanged by this slice.
- [x] ADR for authorize-then-capture exists under `docs/adr/`.

## Status

**Done** on `cursor/domain-glossary-tier-result`.

- `lib/authorization-hold` — manual-capture PI create/capture/release + Checkout hold
- `POST /api/results/hold` — prices via `result-pricing`, upserts Result `held`, Checkout redirect, Telegram + email
- `GET /api/results/[id]` — status by access token or logged-in customer
- `/[lang]/results/[id]` status page (pending review; no Accept yet)
- `/[lang]/account/results` list + account home link
- mp-config preview: cover/case, add-ons, address, shipping, authorize CTA (no fillings/protector)
- Webhook attaches `payment_intent_id` when `metadata.result_id` present
- Migration `0045_result_customer_access.sql`
- ADR `docs/adr/0002-authorize-then-capture-customised-goods.md`

## Blocked by

- Slice 04 (Result model + modules)
- Slice 03 (shop no longer sells pillows directly — avoids conflicting purchase paths)
