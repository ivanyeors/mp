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

- [ ] Completing **online** mp-config purchase path creates a Result in `held` with authorized amount including base MSRP + prefs/add-ons + shipping + tax.
- [ ] Result stores selected cover and case preference item ids (customer preferences).
- [ ] Result stores selected accessory add-on item ids and quantities.
- [ ] Customer-facing flow has no control to pick fillings or protector.
- [ ] Stripe shows an uncaptured PaymentIntent (manual capture); customer is not charged yet.
- [ ] Status page shows pending review (no Accept until assigned — Accept lands in slice 07).
- [ ] Guest can open the status page via email or magic link.
- [ ] Logged-in customer can open the same Result from an account area (list or detail).
- [ ] Operators receive Telegram with link to the Result on the platform.
- [ ] Inventory balances unchanged after hold (no reserve, no deduct).
- [ ] Customer-visible copy uses **tier** (not kind) for basic/premium.
- [ ] mp-maker routes and behavior are unchanged by this slice.
- [ ] ADR for authorize-then-capture exists under `docs/adr/`.

## Blocked by

- Slice 04 (Result model + modules)
- Slice 03 (shop no longer sells pillows directly — avoids conflicting purchase paths)
