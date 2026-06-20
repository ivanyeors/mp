-- ============================================================
-- Transactional email idempotency ledger
-- ============================================================
-- Records every transactional order email so the lifecycle code (Stripe
-- webhook, fulfillment action) can guarantee at-most-once delivery per
-- (order, template). The unique (order_id, template) constraint is the
-- idempotency key — a row is claimed before sending, so concurrent webhook
-- retries never produce duplicate emails.

create table if not exists order_emails (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  template            text not null,
  recipient           text not null,
  provider            text,
  provider_message_id text,
  status              text not null default 'sent' check (status in ('pending', 'sent', 'failed')),
  error               text,
  created_at          timestamptz not null default now(),
  unique (order_id, template)
);

create index if not exists idx_order_emails_order_id on order_emails(order_id);

alter table order_emails enable row level security;
drop policy if exists "Service role full access order_emails" on order_emails;
create policy "Service role full access order_emails" on order_emails
  for all using (true) with check (true);
