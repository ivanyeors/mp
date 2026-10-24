# 03 — Measurement fee priced through one helper on every Result surface, plus the hold attribution fix

**Type:** AFK
**Blocked by:** 02
**User stories:** 5, 6, 9, 10, 11
**Labels:** `enhancement`, `bug`, `needs-triage`, `P1`, `area:pricing`

## Goal

A **Result** measured by **Staff** costs its build plus the **Measurement service** fee. One measured by the customer costs its build. The two must agree on every surface that shows or charges a total. The fee enters through **one** function, so the five surfaces that today each build their charge list by hand cannot disagree.

**Ships in the same deploy as 04.** See the ordering hazard in the issue index.

## Scope

### The rule — `lib/pricing/service-lines.ts` (pure)

```ts
export type ServiceLine = { key: ServiceKey; label: string; msrp: number };

export function measurementServiceLine(
  row: Pick<ResultRow, "measured_by_type" | "product_type" | "assigned_tier" | "suggested_tier">,
  prices: ServicePrices,
): ServiceLine | null;
```

- `measured_by_type !== 'staff'` → `null`.
- `product_type === 'bolster'` → `measurement_basic` (PRD decision (c)).
- Otherwise `(assigned_tier ?? suggested_tier) === 'premium'` → `measurement_premium`, else `measurement_basic`.
- Unit-test the full table from the PRD's *Measurement fee rules*.

### The total — `lib/result-pricing/index.ts`

Extend `priceResult` with `services?: number`. Keep the goods subtotal and the services visible as separate numbers, so that callers which must ignore services can:

```ts
export type PriceResultOutput = {
  goods: number;      // priceComposedBuild subtotal: unchanged meaning
  services: number;   // sum of ServiceLine msrp
  subtotal: number;   // goods + services
  shipping: number;
  tax: number;
  total: number;      // subtotal + shipping + tax
};
```

- **Shipping:** `calculateShippingRate`'s `free_above` is tested on `goods`, **not** `subtotal` (`lib/ecommerce/shipping.ts:29-34`). Every caller that passes a subtotal into shipping must pass `goods`.
- **Tax:** `computeTax` is given `subtotal`, so services are in the taxable base. This is a no-op while `DEFAULT_TAX_RULES = []` (`lib/ecommerce/tax.ts:79`), but it must be right before GST is switched on.

### One charge-line helper for all five surfaces

Replace the five hand-built `[...addonLines.map(...), ...placedChargeLines(...)]` blocks with one call that returns add-ons, neck support and service lines together:

| Surface | Today |
|---|---|
| hold | `app/api/results/hold/route.ts:489-503` |
| assign (its own copy) | `app/api/results/[id]/assign/route.ts:371-377` |
| `loadAssignedBuild` | `lib/results/assigned-build.ts:262-268` |
| status API | `app/api/results/[id]/route.ts:171-181` |
| mp-config preview | `app/[lang]/mp-config/mp-config-client.tsx:2270-2295` |

- While inside assign, make it call `loadAssignedBuild` instead of keeping a copy. That copy is how the surfaces came to number five.
- Add `measured_by_type` to `ASSIGNED_BUILD_COLUMNS` (`assigned-build.ts:56-57`). The compile-time check at `:75-81` will insist on it.
- **Mbolster preview** (`app/[lang]/mbolster-config/mbolster-config-client.tsx:332, 410-416, 1512-1514`) shows a shelf price that already differs from the server's. At minimum, render the service line when `staffAssist` is on. Moving it onto the real quote is in scope if it is small, and noted if not.
- **Client:** the preview needs the three prices.
  - Add `services` to the `POST /api/shop/customize` `purpose: "ballpark"` response (`app/api/shop/customize/route.ts:428-437`), read through `loadServicePrices`.
  - The client decides "measured by Staff" from the same fact the server will read. That is the Draft's `measured_by_type`, which the working-as profile stamps on create, not "is a Staff session". A **Staff** member previewing as a customer is not measuring.

### The attribution fix — `app/api/results/hold/route.ts:676`

`measured_by_type: "by_user" as const` is written on every hold, including when it **updates** an existing Draft (`:776-783`).

- **Fix:** on an update, leave `measured_by_type` and `measured_by_staff_id` out of the patch, so the Draft's values stand. On a fresh insert (no Draft), write `by_user` / `null` as today.
- **Regression test:** hold over a Draft stamped `staff` with a staff id. Assert the row keeps both, the hold succeeds (no 0025 check-constraint violation), and `authorized_amount` includes the fee.
- **Verify:** `/mbolster-config` with **Staff assist mode** stamps `measured_by_*` on its Draft the way mp-config does (`app/api/mp-config/responses/route.ts:358-365`). If it does not, wire it here. Otherwise a **Staff**-measured bolster is never charged.

### Telegram

- **Hold message** (`hold/route.ts:819-830`): add *"Measured by {name} · Measurement service (Premium) $50"* when the line exists.
- **In-store finalize message** (`app/api/mp-config/responses/route.ts:476-495`): already names "Measured by"; add the fee.

### Guard — extend `lib/pricing/pricing-surface.check.ts`

- Every file in `MUST_PRICE_THROUGH` (`:108`) must also call the shared charge-line helper, by grep, the same way it asserts `priceComposedBuild`.
- No file other than `lib/pricing/service-lines.ts` may branch on `measured_by_type` to decide a price.

## Acceptance criteria

- [ ] A Premium **Result** with `measured_by_type = 'staff'` holds for build + $50. A Basic one holds for build + $30, a bolster for build + $30, and a `by_user` one for build only.
- [ ] Hold, assign, `loadAssignedBuild`, the status API and the preview return the **same** total for the same row. Asserted by one test that prices a fixture through all five.
- [ ] Changing **Measured by** from staff to customer in the Results list, then assigning, drops the fee from `final_amount`. The reverse adds it.
- [ ] Upselling Basic → Premium, or **Staff** changing the tier at assign, moves the fee to the Premium rate.
- [ ] A shipping method with `free_above = 300` is not made free by a $280 build plus a $50 fee.
- [ ] Commission on a partner-attributed **Order** is unchanged by the fee. The base stays `build.basePrice` (`accept/route.ts:422-441`).
- [ ] The hold over a staff-stamped Draft keeps its attribution and its fee (regression test above).
- [ ] A Partner-assisted run and a self-measured run never show or charge the fee.
- [ ] A reorder of an expired **Staff**-measured build charges the fee (it was never paid; `reorder.ts:38-39` copies `measured_by_*`).
- [ ] `pricing-surface.check.ts` fails on a surface that skips the helper, and on a stray `measured_by_type` price branch.
- [ ] The preview Ballpark shows the fee as its own row, not folded into the pillow price.
