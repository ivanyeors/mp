-- The per-Customer email ledger (PRD-shopify-customer-migration slice 05). The
-- CRM's Aftercare emails reuse it (PRD-customer-crm slices 07 and 08).
--
-- `order_emails` is keyed by `order_id` (0035_order_emails.sql), and a Claim
-- has no Order. This ledger holds the emails that belong to a Customer instead.
-- `template` is the email registry id (lib/email/registry.ts), and `entity_id`
-- is what the email is about: the Customer itself for the Welcome-back voucher,
-- an Order for a check-up reminder. The unique key sends each one at most once.
--
-- The row is claimed as `pending` before sending, then marked `sent` or
-- `failed` (lib/email/customer-emails.ts). A failed send is retried, unlike
-- order_emails, whose failed rows are final: claim_customer_email re-claims a
-- `failed` row while it has attempts left. `attempts` counts claims, so the
-- first try is 1 and the third is the last.
--
-- Server-only, like customer_import_batches (20261020100000): RLS on with no
-- policy, and the client roles hold no grant. The claim function is executable
-- by the service role only.
--
-- Idempotent.

create table if not exists public.customer_emails (
  id          bigserial primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- Registry id, e.g. 'account.welcome_voucher'.
  template    text not null,
  -- What it is about: the Customer, an Order…
  entity_id   uuid not null,
  status      text not null check (status in ('pending', 'sent', 'failed')),
  attempts    int not null default 1,
  last_error  text null,
  sent_at     timestamptz null,
  created_at  timestamptz not null default now(),
  unique (customer_id, template, entity_id)
);

alter table public.customer_emails enable row level security;
revoke all on public.customer_emails from anon, authenticated;
revoke all on sequence public.customer_emails_id_seq from anon, authenticated;

-- Claims one (customer, template, entity) send. Returns the row when this call
-- owns the send, and nothing when it is sent, in flight, or out of attempts.
--
-- One statement, so two concurrent claims cannot both win: the second waits on
-- the first's row lock, then re-checks the WHERE against the row the first
-- wrote, which is `pending` by then.
create or replace function public.claim_customer_email(
  p_customer_id uuid,
  p_template text,
  p_entity_id uuid
)
returns table (id bigint, attempts int)
language sql
volatile
security invoker
set search_path = public
as $$
  insert into customer_emails as e (customer_id, template, entity_id, status)
  values (p_customer_id, p_template, p_entity_id, 'pending')
  on conflict (customer_id, template, entity_id) do update
     set status = 'pending',
         attempts = e.attempts + 1,
         last_error = null
   where e.status = 'failed'
     and e.attempts < 3
  returning e.id, e.attempts;
$$;

revoke execute on function public.claim_customer_email(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_customer_email(uuid, text, uuid) to service_role;
