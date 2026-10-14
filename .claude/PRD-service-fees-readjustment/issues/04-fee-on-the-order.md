# 04 — The fee on the Order as its own line, kept out of shipping, RMA and commission, and shown wherever money is shown

**Type:** AFK
**Blocked by:** 03
**User stories:** 5, 8
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:orders`

## Goal

Accept a **Staff**-measured Premium **Result**. The **Order** has two lines that sum to its subtotal:

- *Mpillow Size M Premium*, at the build price
- *Measurement service (Premium)*, at $50

The customer's receipt, the account order page, the **Admin Panel** order detail and Analytics all show the second line as a service. No courier label, inventory movement, return request or commission ever touches it.

This slice also introduces `order_items.kind`, which slice 08 needs for a re-adjustment **Order**.

**Ships in the same deploy as 03.**

## Scope

### Migration — `supabase/migrations/<ts>_order_items_kind.sql`

```sql
alter table order_items
  add column if not exists kind text not null default 'goods'
    check (kind in ('goods', 'service')),
  add column if not exists service_key text null references service_prices(key);
alter table order_items
  add constraint order_items_service_key_check
    check ((kind = 'service') = (service_key is not null));
```

- Every existing row backfills to `goods` by the default.
- The customer RLS on `order_items` (`0039_customer_order_rls.sql:51-62`) needs no change. Add `kind` and `service_key` to the explicit column list in `ORDER_WITH_ITEMS` (`lib/shop/customer-orders.ts:16-17`), because cost columns are hidden from `authenticated` and that list is an allowlist.
- Add both to `lib/types/ecommerce.ts:324-341`.

### Accept writes the line — `app/api/results/[id]/accept/route.ts`

- **The service row:** after the build row (`:369-388`), insert one row per `ServiceLine`:
  - `kind = 'service'`, `service_key`
  - `sku = 'SERVICE-MEASUREMENT-PREMIUM'` (or the matching key)
  - `product_title = 'Measurement service (Premium)'`
  - `quantity = 1`, `unit_price = total_price = line.msrp`, `variant_id = null`, `customization_snapshot = null`
  - `unit_cost` from `service_prices.cost_price` when set
- **Order totals:** `orders.subtotal = pricing.subtotal` (goods + services). The build row's `unit_price` stays `pricing.goods`. The invariant `sum(order_items.total_price) = orders.subtotal` is asserted in a test.
- **Snapshot:** record `services: ServiceLine[]` in the build snapshot's `pricing` (`lib/results/order-build-snapshot.ts:51-85`), so the **Order** shows exactly what was charged even after a fee change.
- **Unchanged:** the money ledger (`settleResult` writes one charge row per intent, `lib/results/settlement.ts:404-420`, with no per-line breakdown). Inventory: the fee is not a build line, so `assembleBuild` never sees it.

### Everything that assumes "line = parcel" learns otherwise

| Where | Change |
|---|---|
| `lib/shipping/lines.ts:66-93` `loadOrderShippableLines` | Skip `kind = 'service'`. Without this a service row is labelled a `"pillow"` (`:79-82`) |
| Fulfilment / ship queue | An **Order** whose lines are all `service` is never shown as awaiting shipment and is never offered an Easyship rate or label |
| `lib/rma/eligibility.ts:41` `evaluateEligibility` | `kind = 'service'` → ineligible, reason *"Services can't be returned. Contact us if something went wrong."* |
| `lib/ecommerce/inventory-deduction.ts:139, 260` | Already skips variant-less lines. Add a test so it stays that way |
| Commission lines (`app/api/stripe/webhook/route.ts`, step 1c) | Only pillow and bolster lines earn commission. Assert a service line never enters `commissionLines` |
| `lib/analytics/channel-sales.ts` | Service lines are their own **Services** series, not *Others* and not a pillow |

### Everywhere money is shown

| Surface | File |
|---|---|
| Customer status page | `app/[lang]/results/[id]/page.tsx:479-509` (from the status API, slice 03) |
| Assigned email | `lib/email/results.ts`: pricing rows `:275-323`, add a *Services* row |
| Updated email | `lib/email/results.ts:451` |
| Balance-due reminder | `lib/email/results.ts:506` |
| **Result** detail (Admin Panel) | `app/[lang]/settings/results/[id]/result-detail-client.tsx:1066-1071` shows only `final_amount` today. Add a breakdown: build · services · shipping · tax |
| **Order** detail (Admin Panel) | `app/[lang]/settings/orders/[id]/order-detail-client.tsx:889`. The service line renders as a plain line with no courier panel |
| Account order page | `app/[lang]/account/orders/[orderNumber]/page.tsx`. The service line is listed and has no *Request a return* |

## Acceptance criteria

- [ ] Accepting a **Staff**-measured Premium **Result** writes two `order_items` rows. Their `total_price` values sum to `orders.subtotal`, and `orders.total = subtotal + shipping + tax`.
- [ ] Accepting a self-measured **Result** writes one row, byte-for-byte as before this slice.
- [ ] `loadOrderShippableLines` returns only the build for that **Order**, and the parcel's declared value excludes the fee.
- [ ] A service-only **Order** (fixture) never appears in the ship queue and cannot request a rate or label.
- [ ] RMA refuses the service line with the reason above. The build line is unaffected.
- [ ] Commission and inventory are unchanged by the service line (tests).
- [ ] Analytics shows a *Services* series with the fee's revenue. *Others* is unchanged.
- [ ] The status page, the three emails, **Result** detail, **Order** detail and the account order page each show the fee as its own row. Email snapshot tests are updated.
- [ ] The migration backfills every existing row to `kind = 'goods'`, and the check constraint holds on production data (verified on a staging copy).
