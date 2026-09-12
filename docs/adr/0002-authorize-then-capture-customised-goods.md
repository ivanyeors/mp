# Authorize-then-capture for customised goods

Customised mpillow / mbolster purchases authorize the card at submission and capture only after the customer accepts the operator-assigned final build.

## Context

Main products are not plain shop SKUs. An operator must assign size×tier (or length) and a Filling Template before production. Charging at submission would bill the customer for an unreviewed configuration and make declines/refunds the common path. Soft-reserving stock on hold was rejected for v1 complexity.

## Decision

Use a Stripe PaymentIntent with `capture_method: manual` (authorization hold) for the ballpark total from Costings (composed sellable MSRP + preference/add-on MSRPs + shipping + tax). Persist a **Result** in `held` with the payment intent id. Capture only after **Accept** (slice 07); **Decline** / **Expire** cancel the PaymentIntent. Inventory is validated at assign and Accept, and deducted only on successful capture — never on hold.

## Consequences

- Customers see an authorization, not a charge, until they accept the final build.
- Holds must expire before the card authorization dies (SLA slice 08).
- Top-up is required when the final total exceeds the authorized amount.
- In-store measurement-only Results may omit a payment intent (review without hold).

## Amended by ADR 0016 (2026-09-12)

`0016-deferred-payment-for-assisted-builds.md` — a **Result** carrying no authorization hold is payable, settling on Accept through the same immediate-capture Checkout a top-up already uses. Authorize-then-capture stays the default for a shopper who arrives alone and is ready to commit; it is no longer the only path.

The last consequence above is the loose end 0016 ties off. This ADR allowed a measurement-only Result to omit a payment intent but gave it no way to ever be charged, so those rows sat in `held` forever — `lib/results/result-stage.ts` names them `measurement_residue`. The same amendment lets **Staff** send a customer an **Assist link**, compose the build after the measurements arrive, and ask for money at the end.

Nothing here is retracted: charging before an operator has reviewed a configuration is still refused, inventory is still deducted only on successful payment, and `capture` still requires that money was actually taken — it is now the sole guard, since 0016 drops the redundant `accept` one.
