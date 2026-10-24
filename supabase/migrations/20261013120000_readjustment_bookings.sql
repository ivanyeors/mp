-- Re-adjustment bookings (ADR 0024, PRD-service-fees-readjustment slice 06).
--
-- Before this table a Re-adjustment appointment was an anonymous calendar entry:
-- no sign-in, no link to the pillow, no payment. A booking now links a signed-in
-- Customer, one purchase (an order line, or "not listed"), a slot, a Location,
-- and either complimentary or a paid service Order. It is what Staff read at the
-- visit. appointment_reminders (WhatsApp state keyed by calendar event) is
-- unchanged.

create table if not exists readjustment_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  -- 'platform': a line on the customer's own Order. 'unlisted': bought before
  -- accounts existed, in store, or as a gift — always charged, proof checked at
  -- the visit. Shopify purchases are not linked (owner, 2026-10-13).
  purchase_source text not null check (purchase_source in ('platform', 'unlisted')),
  order_item_id uuid null references order_items(id),
  unlisted_where text null
    check (unlisted_where in ('online_before_accounts', 'in_store', 'gift', 'other')),
  unlisted_reference text null,
  -- Snapshots, so the booking still reads correctly if the Order changes.
  product_label text not null,
  product_type text not null check (product_type in ('pillow', 'bolster')),
  tier text null check (tier in ('basic', 'premium')),
  purchase_paid_at timestamptz null,
  order_number text null,
  complimentary boolean not null,
  complimentary_seq int null,
  fee_amount numeric(12,2) not null check (fee_amount >= 0),
  fee_order_id uuid null references orders(id),
  location_id uuid null references partners(id) on delete set null,
  location_name text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  guest_name text not null,
  phone text not null,
  email text not null,
  calendar_event_id text null unique,
  status text not null check (status in
    ('awaiting_payment', 'booked', 'attended', 'no_show', 'cancelled', 'expired', 'needs_reschedule')),
  hold_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  check ((purchase_source = 'platform') = (order_item_id is not null)),
  check (complimentary = (complimentary_seq is not null)),
  check (not complimentary or (fee_amount = 0 and purchase_source = 'platform')),
  check ((status = 'awaiting_payment') = (hold_expires_at is not null))
);

-- The race guard for the last free visit: two tabs claiming the same
-- (line, seq) — the second fails here, not in a read-then-write. A cancelled or
-- expired booking drops out of the index, which is what gives the visit back.
create unique index if not exists readjustment_complimentary_claim
  on readjustment_bookings (order_item_id, complimentary_seq)
  where complimentary and status in ('booked', 'attended', 'no_show');

-- Slot holds a paying customer has while Checkout is open.
create index if not exists readjustment_live_holds
  on readjustment_bookings (start_at)
  where status = 'awaiting_payment';

create index if not exists readjustment_by_customer
  on readjustment_bookings (customer_id, created_at desc);

create index if not exists readjustment_by_order_item
  on readjustment_bookings (order_item_id)
  where order_item_id is not null;

-- Customers read their own bookings; every write is the service role.
alter table readjustment_bookings enable row level security;
drop policy if exists "customer reads own readjustments" on readjustment_bookings;
create policy "customer reads own readjustments" on readjustment_bookings
  for select using (customer_id = current_customer_id());
