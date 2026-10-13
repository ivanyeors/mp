# 06 — Re-adjustment core: `readjustment_bookings`, `evaluateReadjustment()`, the purchase loader

**Type:** AFK
**Blocked by:** 02
**User stories:** 13, 15, 19
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:appointments`

## Goal

Answer one question for a signed-in **Customer**, with no UI: *which pillows and bolsters have you bought, and what would re-adjusting each cost today?* This slice provides the table, the pure rule and the loader. Slices 07 and 08 put a screen and a payment on it.

## Scope

### Migration — `supabase/migrations/<ts>_readjustment_bookings.sql`

```sql
create table if not exists readjustment_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  purchase_source text not null check (purchase_source in ('platform', 'unlisted')),
  order_item_id uuid null references order_items(id),
  unlisted_where text null
    check (unlisted_where in ('online_before_accounts', 'in_store', 'gift', 'other')),
  unlisted_reference text null,                -- customer-typed order or receipt number
  product_label text not null,                 -- snapshot: "Premium Mpillow · Size M"
  product_type text not null check (product_type in ('pillow', 'bolster')),
  tier text null check (tier in ('basic', 'premium')),
  purchase_paid_at timestamptz null,           -- snapshot of orders.paid_at
  complimentary boolean not null,
  complimentary_seq int null,
  fee_amount numeric(12,2) not null check (fee_amount >= 0),
  fee_order_id uuid null references orders(id),
  location_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  calendar_event_id text null unique,
  status text not null check (status in
    ('awaiting_payment', 'booked', 'attended', 'no_show', 'cancelled', 'expired', 'needs_reschedule')),
  hold_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((purchase_source = 'platform') = (order_item_id is not null)),
  check (complimentary = (complimentary_seq is not null)),
  check (not complimentary or (fee_amount = 0 and purchase_source = 'platform'))
);

create unique index readjustment_complimentary_claim
  on readjustment_bookings (order_item_id, complimentary_seq)
  where complimentary and status in ('booked', 'attended', 'no_show');

create index readjustment_live_holds
  on readjustment_bookings (start_at)
  where status = 'awaiting_payment';

alter table readjustment_bookings enable row level security;
create policy "customer reads own readjustments" on readjustment_bookings
  for select using (customer_id = current_customer_id());
```

- **No customer writes.** Every write goes through the service role in slice 07 and 08 routes, as RMA does (`20260723120000_rma_returns_schema.sql:105-128`).
- `location_id` is `text` because `getLocation` takes a string id (`app/api/appointments/book/route.ts:52`). Match the `partners.id` type when writing the migration.

### The rule — `lib/readjustment/eligibility.ts` (pure)

```ts
export type ReadjustablePurchase = {
  source: "platform" | "unlisted";
  orderItemId: string | null;
  productType: "pillow" | "bolster";
  tier: "basic" | "premium" | null;
  paidAt: string | null;        // ISO
  units: number;                // quantity − returned_quantity
};

export type ReadjustmentQuote =
  | { complimentary: true;  fee: 0;      seq: number; freeUntil: string /* YYYY-MM-DD SGT */ }
  | { complimentary: false; fee: number; reason: "not_premium" | "window_ended" | "free_visit_used" | "unlisted";
      windowEndedOn?: string };

export function evaluateReadjustment(
  purchase: ReadjustablePurchase,
  usedComplimentary: number,          // bookings for this line in booked|attended|no_show with complimentary
  policy: ReadjustmentPolicy,         // { freeVisits, freeWindowDays } from slice 02
  fee: number,                        // service_prices.readjustment
  today: string,                      // YYYY-MM-DD in Asia/Singapore
): ReadjustmentQuote;
```

- **Free only if** `source === 'platform'`, `productType === 'pillow'`, `tier === 'premium'`, `today <= sgtDate(paidAt) + freeWindowDays`, and `usedComplimentary < freeVisits × units`.
- **`seq`** is the lowest unused 1-based sequence number. The unique index is the real guard; `seq` is just what the route tries to claim.
- **Dates** are Singapore calendar days. Reuse the `sgtToday()` shape in `components/slide-in-pages/booking-flow.tsx:22`, lifted into `lib/appointments/format.ts` so server and client agree.
- **Tests:** a table covering day 0, day 60, day 61, Basic, Mbolster, unlisted, second visit, two units, a cancelled visit given back, `freeVisits = 0`, and a purchase made late at night in SGT, which is the day before in UTC.

### The loader — `lib/readjustment/purchases.ts`

```ts
export async function listReadjustablePurchases(admin, customerId): Promise<Array<ReadjustablePurchase & {
  label: string; imageUrl: string | null; orderNumber: string; quote: ReadjustmentQuote;
}>>;
```

- **Orders:** `orders.customer_id = customerId`, `paid_at is not null`, `status not in ('pending','cancelled','refunded','payment_failed')`.
- **Lines:** `kind = 'goods'` (slice 04; until then, no filter), classified pillow or bolster by the `loadOrderShippableLines` rule (`lib/shipping/lines.ts:79-82`), with `quantity − returned_quantity > 0`.
- **Tier and size or length:**
  - Shop variant → `product_variants.pillow_product_id → pillow_products(size, kind)`.
  - Bolster variant → `price_key 'product:bolster:{len}'` / `option1`.
  - **Result** order → `customization_snapshot.assigned_size / assigned_tier / assigned_length`, detected by `isResultCustomisedOrder` (`lib/results/post-delivery-refund.ts:17-19`).
  - Legacy cart customisation → `customization_configs`.
- **Used complimentary:** one query over `readjustment_bookings` grouped by `order_item_id`.
- **Order:** newest first.
- **Scope:** with the **service role**, but always filtered by the `customerId` the caller resolved from the session. Never by an id from a request body.

## Acceptance criteria

- [ ] The migration applies. The three CHECKs reject a complimentary unlisted booking, a complimentary booking with a fee, and a platform booking without an `order_item_id`.
- [ ] Two inserts claiming the same `(order_item_id, complimentary_seq)` in `booked` fail the second at the database. Cancelling the first lets the claim succeed again.
- [ ] `evaluateReadjustment` passes the full table above.
- [ ] `listReadjustablePurchases` returns, for a fixture customer with one shop Premium pillow, one **Result** Basic pillow, one bolster and one accessory, exactly the first three, each with the right label and quote.
- [ ] A partly returned line (`quantity 2`, `returned_quantity 1`) has one unit, and its complimentary allowance is one.
- [ ] A customer cannot read another customer's rows through the RLS policy. Tested with two sessions.
