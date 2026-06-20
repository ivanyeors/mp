-- ============================================================
-- Stripe webhook dead-letter log
-- ============================================================
-- Critical webhook steps (order confirmation, inventory deduction) that fail
-- are recorded here and the webhook returns HTTP 500 so Stripe retries. Rows
-- are keyed by Stripe event id for idempotent inserts across retries.

create table if not exists stripe_webhook_failures (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null,
  event_type  text not null,
  payload     jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists idx_stripe_webhook_failures_event_id
  on stripe_webhook_failures(event_id);

create index if not exists idx_stripe_webhook_failures_unresolved
  on stripe_webhook_failures(created_at desc)
  where resolved_at is null;

alter table stripe_webhook_failures enable row level security;
create policy "Service role full access stripe_webhook_failures" on stripe_webhook_failures
  for all using (true) with check (true);
