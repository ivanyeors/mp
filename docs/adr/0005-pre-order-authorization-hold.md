# Pre-order on authorization hold when inventory cannot fulfill now

When immediate build is impossible from current inventory, customise preview still takes an **Authorization hold**, labels the path **Pre-order**, and persists that mode on the **Result**.

## Context

Customised goods already authorize first and capture after Accept (ADR 0002). Soft-reserving stock on hold was rejected. Preference pickers on the hold path already allow zero-stock options (`allowSoldOut`) and badge them “Low stock,” which under-communicates that fulfillment may wait.

Alternatives considered:

1. **Block authorize** when preference on-hand or composed sellable buildable is 0 — loses demand and conflicts with “still pay.”
2. **Soft-reserve on hold** — rejected again for v1 complexity (same as ADR 0002).
3. **UI-only Pre-order copy** — disappears after Stripe return and on `/results`; operators cannot see the promise.
4. **Manual restock email** — ops overhead; product requires automation.

## Decision

- **Trigger (live):** required **Customer preference** line `stock_available <= 0` (Mpillow: cover or case; Mbolster: case only), **or** recommended **Composed sellable** buildable `<= 0`. Soft low-stock badges (e.g. qty ≤ 5) do **not** flip the mode.
- **Preview CTA:** recomputed live — **Pre-order** + fixed-i18n waiting-time section when trigger is true (promise: WhatsApp reach-out shortly; no numeric ETA); otherwise normal hold CTA (**Proceed**, not “Purchase”).
- **Result:** persist Pre-order mode at hold create (sticky for that submission). Same money path: hold → assign → Accept → capture → **Order**. No separate Pre-order queue in v1.
- **Restock notice:** when inventory recovers enough that the trigger would clear, **automatically** email open Pre-order **Results** in `held` or `assigned` (idempotent). Skip expired/declined/captured/canceled. No Staff-triggered send in v1.
- **Scope:** Mpillow (full/basic) and Mbolster. Packaged as vertical slices inside the UX polish Jul 2026 PRD.

## Consequences

- Sold-out customise still creates holds; messaging and Result flag must stay honest about delay.
- Restock automation needs a reliable inventory → notify path and dedupe metadata on the Result.
- Operators fulfill Pre-order Results through the existing queue; status copy should say **Result**, not **Order**, before Accept + capture.
- Extends ADR 0002; does not change capture_method or soft-reserve policy.
