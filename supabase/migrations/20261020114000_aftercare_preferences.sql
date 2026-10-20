-- Aftercare preferences and the aftercare WhatsApp ledger (PRD customer-crm
-- slice 13, ADR 0027 decisions f, h and l).
--
-- Two switches per Customer: email is on by default (a service message with an
-- opt-out), WhatsApp is off until the customer opts in (Meta's rule, and the
-- partners' notify_whatsapp precedent, 20260802000000). Only two sources change
-- them: the customer in their own Profile, once signed in, and Staff with the
-- manual switch. Every change is an append-only event, and the one write path is
-- set_aftercare_preference(), which writes the column and the event together.
--
-- customer_whatsapp is the claim-before-send ledger the review request (slice
-- 07) and the check-up (slice 08) send through, one row per (customer, template,
-- entity), mirroring partner_whatsapp.
--
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. The two switches
-- ---------------------------------------------------------------------------
-- One statement per column, so the migration scans that list a table's
-- columns (lib/ecommerce/__tests__/cost-column-grants.test.ts) see both.
alter table public.customers add column if not exists aftercare_email boolean not null default true;
alter table public.customers add column if not exists aftercare_whatsapp boolean not null default false;

-- The customer may read their own switches (CRM slice 02 replaces the table
-- grant on customers with column grants; a column the customer reads must be
-- granted, README hazard one). While the table grant still stands this adds
-- nothing. The app itself reads them server-side, keyed by the session's
-- Customer, so the Profile does not depend on this grant.
grant select (aftercare_email, aftercare_whatsapp) on public.customers to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Every change, append-only
-- ---------------------------------------------------------------------------
create table if not exists public.customer_preference_events (
  id                    bigserial primary key,
  customer_id           uuid not null references public.customers(id) on delete cascade,
  preference            text not null check (preference in ('aftercare_email', 'aftercare_whatsapp')),
  to_value              boolean not null,
  source                text not null check (source in ('profile', 'staff')),
  changed_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  note                  text null check (length(note) <= 300),
  -- The opt-in text the customer saw, when turning WhatsApp on: the evidence
  -- of consent the PDPA asks for.
  wording               text null,
  created_at            timestamptz not null default now()
);

create index if not exists customer_preference_events_customer_idx
  on public.customer_preference_events (customer_id, preference, created_at desc);

alter table public.customer_preference_events enable row level security;
revoke all on public.customer_preference_events from anon, authenticated;

-- Append-only. A correction is a new event. The only changes let through are
-- the ones the foreign keys make themselves (a Customer deleted, a Staff
-- profile deleted): those arrive from the referential trigger, one level down.
create or replace function public.reject_customer_preference_event_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  raise exception 'customer_preference_events is append-only: record a new event, not an edit'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_customer_preference_events_append_only on public.customer_preference_events;
create trigger trg_customer_preference_events_append_only
before update or delete on public.customer_preference_events
for each row execute procedure public.reject_customer_preference_event_change();

-- ---------------------------------------------------------------------------
-- 3. The one write path
-- ---------------------------------------------------------------------------
-- Writes the column and appends the event in one transaction, and writes
-- nothing when the value is unchanged. Returns whether anything changed.
-- Turning WhatsApp on needs the customer's own action (with the wording they
-- saw) or a Staff note recording that they agreed (README hazard two).
create or replace function public.set_aftercare_preference(
  p_customer_id uuid,
  p_preference  text,
  p_value       boolean,
  p_source      text,
  p_profile_id  uuid default null,
  p_note        text default null,
  p_wording     text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current boolean;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_wording text := nullif(btrim(coalesce(p_wording, '')), '');
begin
  if p_preference not in ('aftercare_email', 'aftercare_whatsapp') then
    raise exception 'Unknown aftercare preference %', p_preference using errcode = 'invalid_parameter_value';
  end if;
  if p_source not in ('profile', 'staff') then
    raise exception 'Unknown preference source %', p_source using errcode = 'invalid_parameter_value';
  end if;
  if p_value is null then
    raise exception 'A preference is on or off, not null' using errcode = 'invalid_parameter_value';
  end if;

  -- Lock the row so two changes at once cannot both see the old value.
  if p_preference = 'aftercare_email' then
    select aftercare_email into v_current from customers where id = p_customer_id for update;
  else
    select aftercare_whatsapp into v_current from customers where id = p_customer_id for update;
  end if;
  if not found then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;

  if v_current = p_value then
    return false;
  end if;

  if p_preference = 'aftercare_whatsapp' and p_value then
    if p_source = 'profile' and v_wording is null then
      raise exception 'Turning WhatsApp on from the Profile stores the wording shown'
        using errcode = 'invalid_parameter_value';
    end if;
    if p_source = 'staff' and v_note is null then
      raise exception 'Turning WhatsApp on for a customer needs a note saying how they agreed'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if p_preference = 'aftercare_email' then
    update customers set aftercare_email = p_value where id = p_customer_id;
  else
    update customers set aftercare_whatsapp = p_value where id = p_customer_id;
  end if;

  insert into customer_preference_events
    (customer_id, preference, to_value, source, changed_by_profile_id, note, wording)
  values
    (p_customer_id, p_preference, p_value, p_source,
     case when p_source = 'staff' then p_profile_id end,
     v_note,
     case when p_preference = 'aftercare_whatsapp' and p_value then v_wording end);

  return true;
end;
$$;

-- Server only: the customer's own key must not flip a switch over RPC. The
-- Profile reaches it through a server action that resolves the Customer from
-- the session (20260917033807:39-40 for the pattern).
revoke execute on function public.set_aftercare_preference(uuid, text, boolean, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_aftercare_preference(uuid, text, boolean, text, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. The aftercare WhatsApp ledger
-- ---------------------------------------------------------------------------
-- Claimed as `pending` before the send, then marked `sent` or `failed`. A
-- failed WhatsApp send is not retried: email carries the message. The unique
-- key is what stops a second send under concurrent runs.
create table if not exists public.customer_whatsapp (
  id          bigserial primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  template    text not null,                 -- 'aftercare.review_request', 'aftercare.checkup_12m'
  entity_id   uuid not null,                 -- the Customer (review) or the Order (check-up)
  phone       text not null,                 -- E.164, as sent
  status      text not null check (status in ('pending', 'sent', 'failed')),
  wa_id       text null,
  last_error  text null,
  sent_at     timestamptz null,
  created_at  timestamptz not null default now(),
  unique (customer_id, template, entity_id)
);

-- The webhook asks "when did this number last get an aftercare message?" before
-- it lets a bare "cancel" cancel an appointment, and marks late delivery
-- failures by message id.
create index if not exists customer_whatsapp_phone_sent_idx
  on public.customer_whatsapp (phone, sent_at desc) where status = 'sent';
create index if not exists customer_whatsapp_wa_id_idx
  on public.customer_whatsapp (wa_id) where wa_id is not null;

alter table public.customer_whatsapp enable row level security;
revoke all on public.customer_whatsapp from anon, authenticated;

-- A STOP reply is derived from whatsapp_inbound (kind 'stop'), keyed by phone;
-- the existing (phone, received_at desc) index serves that lookup.

comment on table public.customer_preference_events is
  'Aftercare preference changes (CRM slice 13). Append-only; written only by set_aftercare_preference().';
comment on table public.customer_whatsapp is
  'Aftercare WhatsApp ledger (CRM slice 13). At-most-once per (customer_id, template, entity_id); email is the record.';
