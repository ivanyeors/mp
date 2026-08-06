-- Commission ledger (#77, ADR 0015). Held-on-capture / released-when-the-return-
-- window-closes / voided-on-refund commissions for a partner's referred pillow &
-- bolster UNITS. Additive/prod-safe per ADR 0012 (create-if-not-exists, add-if-not-
-- exists, service-role RLS, set_updated_at trigger). Deployed code guards on
-- orders.partner_id, so this is invisible until the hub ships.

-- Scheme table: a DEFAULT scheme (partner_id null) per product_type, plus optional
-- per-partner overrides. Edited only in the Admin Panel (Partner Commissions page).
create table if not exists commission_schemes (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid references partners(id) on delete cascade,  -- null = DEFAULT
  product_type text not null check (product_type in ('pillow', 'bolster')),
  kind         text not null check (kind in ('flat', 'percent')),
  amount       numeric(12,2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One scheme per (partner, product_type); the DEFAULT (null partner) collapses to a
-- sentinel so a single DEFAULT row per product_type is enforced too.
create unique index if not exists idx_commission_schemes_key
  on commission_schemes (coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid), product_type);

-- Ledger: one row per commissionable order_item.
create table if not exists commissions (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  order_item_id     uuid not null references order_items(id) on delete cascade,
  partner_id        uuid not null references partners(id) on delete cascade,
  product_type      text not null check (product_type in ('pillow', 'bolster')),
  base_amount       numeric(12,2) not null check (base_amount >= 0),   -- pillow/bolster BASE only (no add-ons/shipping/tax)
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  status            text not null default 'held' check (status in ('held', 'released', 'void')),
  delivered_at      timestamptz,   -- return-window anchor (order delivery); null until delivered
  release_at        timestamptz,   -- delivered_at + return window
  released_at       timestamptz,
  voided_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One commission per order_item makes creation idempotent (upsert on redelivery).
create unique index if not exists idx_commissions_order_item on commissions (order_item_id);
create index if not exists idx_commissions_partner on commissions (partner_id);
create index if not exists idx_commissions_status on commissions (status);
create index if not exists idx_commissions_order on commissions (order_id);

-- updated_at triggers (shared set_updated_at()).
drop trigger if exists trg_commission_schemes_updated_at on commission_schemes;
create trigger trg_commission_schemes_updated_at
before update on commission_schemes
for each row execute procedure set_updated_at();

drop trigger if exists trg_commissions_updated_at on commissions;
create trigger trg_commissions_updated_at
before update on commissions
for each row execute procedure set_updated_at();

-- All access via the server (service role); no anon/authenticated direct access.
alter table commission_schemes enable row level security;
drop policy if exists "Service role full access commission_schemes" on commission_schemes;
create policy "Service role full access commission_schemes" on commission_schemes
  for all using (true) with check (true);

alter table commissions enable row level security;
drop policy if exists "Service role full access commissions" on commissions;
create policy "Service role full access commissions" on commissions
  for all using (true) with check (true);

-- Seed DEFAULT schemes ($50 flat per UNIT sold) so an attributed order always
-- resolves a scheme even before staff edit anything. `flat` → amount × quantity
-- (see computeCommission) = $50 per pillow/bolster sold. Editable in the Admin Panel.
insert into commission_schemes (partner_id, product_type, kind, amount)
values (null, 'pillow', 'flat', 50), (null, 'bolster', 'flat', 50)
on conflict do nothing;

comment on table commissions is
  'Partner commission ledger (#77, ADR 0015). Held on attributed capture, released when the RMA return window closes (dated from delivered_at, never paid_at), voided on RMA refund. Pure calc/lifecycle in lib/commissions.';
