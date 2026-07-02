-- Slice 07: append-only money ledger + partial/idempotent refunds + disputes.
--
-- Replaces the single `orders.status = 'refunded'` money state with an
-- append-only ledger (`order_payments`) that is the source of truth for an
-- order's net money. Every charge, refund, dispute outcome, and fee is a signed
-- row keyed by its Stripe object id, so a re-delivered webhook is a no-op.
--
-- `orders` gains rolled-up money columns and a `needs_attention` flag (oversold
-- / failed-refund triage); `order_items` gains `returned_quantity` (bumped by
-- the deliberate manual restock in slice 08, never auto-restocked here).

-- Partial-refund order state. (PG12+ permits ADD VALUE inside a transaction as
-- long as the value isn't used in the same migration — we only use it at runtime.)
alter type order_status add value if not exists 'partially_refunded';

-- ============================================================
-- ORDER PAYMENTS (append-only money ledger)
-- ============================================================
create table if not exists order_payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  type            text not null check (type in (
                    'charge', 'refund', 'dispute_hold', 'dispute_loss',
                    'dispute_won', 'fee', 'adjustment'
                  )),
  -- Signed major units: charges/credits positive, refunds/losses/fees negative.
  amount          numeric(12,2) not null,
  currency        text not null default 'SGD',
  -- Stripe object that produced this row (pi_…, re_…, dp_…). Unique when present
  -- so a re-delivered event can't double-count money. Null for manual adjustments.
  stripe_object_id text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_order_payments_stripe_object
  on order_payments(stripe_object_id) where stripe_object_id is not null;
create index if not exists idx_order_payments_order
  on order_payments(order_id, created_at);

alter table order_payments enable row level security;
create policy "Service role full access order_payments" on order_payments
  for all using (true) with check (true);

-- ============================================================
-- ORDER money rollups + triage flag
-- ============================================================
alter table orders add column if not exists amount_captured numeric(12,2) not null default 0;
alter table orders add column if not exists amount_refunded numeric(12,2) not null default 0;
alter table orders add column if not exists needs_attention boolean not null default false;

create index if not exists idx_orders_needs_attention
  on orders(needs_attention) where needs_attention = true;

-- ============================================================
-- ORDER ITEMS returned-quantity (manual restock target, slice 08)
-- ============================================================
alter table order_items add column if not exists returned_quantity integer not null default 0
  check (returned_quantity >= 0);
