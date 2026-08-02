-- Partner WhatsApp notifications (#86). Additive/prod-safe per ADR 0012 expand:
-- a per-partner opt-in preference (default OFF — email stays always-on) plus a
-- WhatsApp idempotency ledger mirroring partner_emails. Deployed code ignores
-- both until #86 ships, and the email/payment paths are untouched.

-- Per-PARTNER channel preference (on the partners aggregate, not partner_users):
-- the four events are partner-level, so the preference is one per clinic and is
-- read/written by partner_id in every session (incl. backup-email sign-in).
-- Email is always-on; WhatsApp is additive.
alter table partners
  add column if not exists notify_whatsapp boolean not null default false;

-- At-most-once WhatsApp send per (partner_id, template, entity_id). Separate from
-- partner_emails so the payment-adjacent email ledger's unique constraint is never
-- touched. Same entity_id scheme as partner_emails (order id, `${partnerId}:tierN`,
-- payout id, `${partnerId}:${version}`).
create table if not exists partner_whatsapp (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid references partners(id) on delete cascade,
  template            text not null,
  entity_id           text not null,
  recipient           text,
  provider_message_id text,
  status              text not null default 'sent' check (status in ('pending', 'sent', 'failed')),
  error               text,
  dispatched_at       timestamptz,
  created_at          timestamptz not null default now(),
  unique (partner_id, template, entity_id)
);

create index if not exists idx_partner_whatsapp_partner on partner_whatsapp(partner_id);

-- All access via server (service role), mirroring partner_emails.
alter table partner_whatsapp enable row level security;
drop policy if exists "Service role full access partner_whatsapp" on partner_whatsapp;
create policy "Service role full access partner_whatsapp" on partner_whatsapp
  for all using (true) with check (true);

comment on table partner_whatsapp is
  'Partner WhatsApp idempotency ledger (#86). At-most-once per (partner_id, template, entity_id); mirrors partner_emails. Additive to the email channel, which is always-on.';
