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
