# Slice 06 — Flow route: upsell/cross-sell card, answer carry-over, journey record

Type: HITL (upsell card copy/design review)
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: hitl-review
User stories covered: 11, 30, 31, 32, 33, 34, 35

## What to build

Flow route terminals become a live shopper mechanic, resolved before Stripe.

- When the flow's graph fires a Flow route, the completed preview shows the same-flow result **plus an Upsell card**: reason from the fired path, both prices, Upgrade / Keep choices. Decline keeps the same-flow fallback result and proceeds normally.
- Accept → shared answers carry over 1:1 into the target flow; the wizard routes to **only the missing steps** (Basic → Premium: the three neck measurements; Bolster → Mpillow: mpillow measurement + customize steps, with the card setting the ~2-minute expectation); the target graph evaluates and the preview re-renders with the target product, price, and recommendation.
- Tier suggestion terminals render advisory copy on Basic/in-store surfaces ("Based on acid reflux we'd recommend Premium"); they never change the held product (sold tier stays flow-scoped).
- All routing resolves before the Stripe hold; hold amount always matches the confirmed product. The Result records entry flow, fired route terminal, and final flow.
- Pure lib: answer carry-over mapping per flow pair (vitest); journey recording on the recommendation record.

## Acceptance criteria

- [x] A Basic session whose answers fire the Premium route sees the upsell card with reason + both prices; Decline lands on the Basic fallback result and can hold normally
- [x] Accept carries answers over, collects only the neck trio, and re-renders the Premium preview with premium product and price before any Stripe interaction
- [x] Bolster → Mpillow cross-sell collects the mpillow steps with expectation-setting copy
- [x] The held Result records entry flow → final flow and the fired route terminal
- [x] Tier suggestion renders as copy only; the held product and amount never change without the shopper's explicit Upgrade
- [x] Vitest: carry-over mapping per flow pair; `*.check.ts` for pre-Stripe routing gate

## Proof (2026-07-19)

- Branch: `feat/rules-engine-slice-06` (base = slice 05 `f81a0530`)
- `npx vitest run lib/rules-engine` — includes carry-over + journey + upsell fixture
- `npx tsx lib/rules-engine/slice-06.check.ts` — ok
- Fixture `basicWithPremiumUpsellGraph` fires Premium route on `acid_reflux` (day-one seed still has no Flow route; Staff publish this or author on canvas for live HITL)
- Hold API rejects pending routes (`409`); client disables Authorize while Upsell awaits consent

## Blocked by

- Slice 03 (engine cutover) and Slice 05 (preview recommendation display)
