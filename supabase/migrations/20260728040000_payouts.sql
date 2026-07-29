-- Partner payouts (#81, ADR 0015). Manual payout workflow: a partner stores their
-- PayNow QR + bank details (PRIVATE), staff record a payout with a proof-of-payment
-- image, and the covered released commissions flip to the terminal `paid` state.
-- Additive/prod-safe per ADR 0012 (create/add-if-not-exists, service-role RLS,
-- shared set_updated_at trigger). Invisible until the hub ships.

-- Private storage bucket for PayNow QR + proof-of-payment images. NOT the public
-- `media` bucket used by lib/config-upload + lib/partner-upload: this is
-- service-role only, read exclusively through short-lived createSignedUrl. No
-- anon/authenticated storage policies are created, so objects are unreachable
-- except through the server (service role bypasses storage RLS).
insert into storage.buckets (id, name, public)
values ('partner-private', 'partner-private', false)
on conflict (id) do nothing;

-- Partner-supplied payout destination. One row per partner (partner_id is the PK).
-- paynow_qr_path is a PRIVATE bucket key, never a public URL.
create table if not exists partner_payment_details (
  partner_id          uuid primary key references partners(id) on delete cascade,
  paynow_qr_path      text,
  bank_name           text,
  bank_account_name   text,
  bank_account_number text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_partner_payment_details_updated_at on partner_payment_details;
create trigger trg_partner_payment_details_updated_at
before update on partner_payment_details
for each row execute procedure set_updated_at();

-- Immutable payout records. Corrections are a NEW row (negative amount), never an
-- edit (AC6) — enforced by a trigger that rejects UPDATE. amount is SIGNED (no
-- >= 0 check) so a correction can be negative. proof_path is a private bucket key.
create table if not exists partner_payouts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  amount      numeric(12,2) not null,
  paid_on     date not null,
  method      text,
  reference   text,
  proof_path  text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_partner_payouts_partner on partner_payouts (partner_id, created_at desc);

-- AC6: block edits. Corrections must be a new row. DELETE is left to the partner
-- cascade (a partner teardown removes their payouts); the app has no delete path.
create or replace function reject_partner_payout_update() returns trigger as $$
begin
  raise exception 'partner_payouts is immutable: record a correcting entry, not an edit';
end;
$$ language plpgsql;

drop trigger if exists trg_partner_payouts_immutable on partner_payouts;
create trigger trg_partner_payouts_immutable
before update on partner_payouts
for each row execute procedure reject_partner_payout_update();

-- Link `paid` commissions to the payout that covered them (additive).
alter table commissions add column if not exists payout_id uuid references partner_payouts(id);
create index if not exists idx_commissions_payout on commissions (payout_id);

-- Extend the status check to include the terminal `paid` state. Additive: drop the
-- inline column check by its deterministic generated name, recreate with `paid`.
alter table commissions drop constraint if exists commissions_status_check;
alter table commissions add constraint commissions_status_check
  check (status in ('held', 'released', 'void', 'paid'));

-- Service-role only (all access via the server).
alter table partner_payment_details enable row level security;
drop policy if exists "Service role full access partner_payment_details" on partner_payment_details;
create policy "Service role full access partner_payment_details" on partner_payment_details
  for all using (true) with check (true);

alter table partner_payouts enable row level security;
drop policy if exists "Service role full access partner_payouts" on partner_payouts;
create policy "Service role full access partner_payouts" on partner_payouts
  for all using (true) with check (true);

comment on table partner_payouts is
  'Immutable partner payout records (#81, ADR 0015). Corrections = a new (negative) row. proof_path + partner_payment_details.paynow_qr_path are keys in the private `partner-private` bucket, served via short-lived signed URLs.';
