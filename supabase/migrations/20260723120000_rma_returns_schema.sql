-- Returns/RMA schema (ADR 0011). Item-level return requests with an explicit
-- lifecycle, a customer-visible status timeline, and an email idempotency ledger
-- keyed on (rma_request_id, template). `refund` resolutions reuse the existing
-- refundPayment + charge.refunded money-ledger webhook — no new money path here.

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type rma_resolution as enum ('refund', 'exchange', 'replacement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rma_status as enum (
    'requested', 'approved', 'rejected', 'cancelled',
    'instructions_sent', 'received', 'completed', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type rma_actor as enum ('customer', 'staff', 'system');
exception when duplicate_object then null; end $$;

-- Requests --------------------------------------------------------------------
create table if not exists rma_requests (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  resolution      rma_resolution not null,
  status          rma_status not null default 'requested',
  reason          text,
  customer_note   text,
  photo_urls      text[] not null default '{}',
  -- exchange/replacement outbound tracking, captured at completion
  tracking_number text,
  tracking_url    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_rma_requests_order on rma_requests(order_id);
create index if not exists idx_rma_requests_customer on rma_requests(customer_id);
create index if not exists idx_rma_requests_status on rma_requests(status);

-- Items -----------------------------------------------------------------------
create table if not exists rma_request_items (
  id             uuid primary key default gen_random_uuid(),
  rma_request_id uuid not null references rma_requests(id) on delete cascade,
  order_item_id  uuid not null references order_items(id),
  quantity       integer not null check (quantity >= 1),
  created_at     timestamptz not null default now()
);
create index if not exists idx_rma_request_items_request on rma_request_items(rma_request_id);
create index if not exists idx_rma_request_items_order_item on rma_request_items(order_item_id);

-- Status timeline (append-only; rma_requests.status is a cache of the latest) --
create table if not exists rma_status_events (
  id             uuid primary key default gen_random_uuid(),
  rma_request_id uuid not null references rma_requests(id) on delete cascade,
  from_status    rma_status,
  to_status      rma_status not null,
  actor          rma_actor not null,
  reason         text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_rma_status_events_request on rma_status_events(rma_request_id);

-- Email idempotency ledger, keyed on (rma_request_id, template) ----------------
create table if not exists rma_emails (
  id                  uuid primary key default gen_random_uuid(),
  rma_request_id      uuid not null references rma_requests(id) on delete cascade,
  template            text not null,
  recipient           text not null,
  provider            text,
  provider_message_id text,
  status              text not null default 'sent' check (status in ('pending', 'sent', 'failed')),
  error               text,
  created_at          timestamptz not null default now(),
  unique (rma_request_id, template)
);
create index if not exists idx_rma_emails_request on rma_emails(rma_request_id);

-- RLS -------------------------------------------------------------------------
-- Server writes go through the service role (like the order refund-request flow).
-- Customers read only their own RMAs under the anon/SSR client; they never write
-- directly. rma_emails is service-role only (an internal ledger).
alter table rma_requests enable row level security;
alter table rma_request_items enable row level security;
alter table rma_status_events enable row level security;
alter table rma_emails enable row level security;

drop policy if exists "Service role full access rma_requests" on rma_requests;
create policy "Service role full access rma_requests" on rma_requests
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access rma_request_items" on rma_request_items;
create policy "Service role full access rma_request_items" on rma_request_items
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access rma_status_events" on rma_status_events;
create policy "Service role full access rma_status_events" on rma_status_events
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access rma_emails" on rma_emails;
create policy "Service role full access rma_emails" on rma_emails
  for all to service_role using (true) with check (true);

drop policy if exists "Customers read own rma_requests" on rma_requests;
create policy "Customers read own rma_requests" on rma_requests
  for select to authenticated
  using (customer_id = current_customer_id());

drop policy if exists "Customers read own rma_request_items" on rma_request_items;
create policy "Customers read own rma_request_items" on rma_request_items
  for select to authenticated
  using (
    exists (
      select 1 from rma_requests r
      where r.id = rma_request_items.rma_request_id
        and r.customer_id = current_customer_id()
    )
  );

drop policy if exists "Customers read own rma_status_events" on rma_status_events;
create policy "Customers read own rma_status_events" on rma_status_events
  for select to authenticated
  using (
    exists (
      select 1 from rma_requests r
      where r.id = rma_status_events.rma_request_id
        and r.customer_id = current_customer_id()
    )
  );

-- Settings --------------------------------------------------------------------
insert into site_settings (key, value)
values ('rma_return_window_days', '30')
on conflict (key) do nothing;

comment on table rma_requests is
  'Item-level customer return (RMA) requests. Lifecycle validated by lib/rma/transitions (ADR 0011).';
