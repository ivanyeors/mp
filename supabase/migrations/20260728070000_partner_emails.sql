-- ============================================================
-- Partner email idempotency ledger (#84)
-- ============================================================
-- Records every transactional PARTNER email so the hooks (application outcome,
-- referral earned, milestone reached, payout made, re-accept terms) guarantee
-- at-most-once delivery per (partner, template, entity). Mirrors order_emails
-- (0035_order_emails.sql): a row is claimed before sending, so retries never
-- produce duplicate emails. Additive/prod-safe per ADR 0012 (create-if-not-
-- exists, service-role RLS), invisible until the hub ships.
--
-- partner_id is NULLABLE: a REJECTED application never creates a `partners` row,
-- so its outcome email has no partner. Idempotency there rests on the caller
-- (rejectApplication is already status-guarded, fires once); every other event
-- has a partner_id, so the (partner_id, template, entity_id) key enforces it.
-- entity_id already encodes the specific entity (order id, `${partnerId}:tierN`,
-- payout id, `${partnerId}:${AGREEMENT_VERSION}`, partner_users id).

create table if not exists partner_emails (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid references partners(id) on delete cascade,   -- null for a rejected application
  template            text not null,
  entity_id           text not null,
  recipient           text,
  provider            text,
  provider_message_id text,
  status              text not null default 'sent' check (status in ('pending', 'sent', 'failed')),
  error               text,
  dispatched_at       timestamptz,
  created_at          timestamptz not null default now(),
  unique (partner_id, template, entity_id)
);

create index if not exists idx_partner_emails_partner on partner_emails(partner_id);

alter table partner_emails enable row level security;
drop policy if exists "Service role full access partner_emails" on partner_emails;
create policy "Service role full access partner_emails" on partner_emails
  for all using (true) with check (true);

comment on table partner_emails is
  'Partner email idempotency ledger (#84). At-most-once per (partner_id, template, entity_id); mirrors order_emails. partner_id null only for a rejected-application outcome email.';
