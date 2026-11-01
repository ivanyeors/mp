-- Unsubscribe reasons (PRD-crm-retention-loop slice 11): when someone
-- unsubscribes, we ask why, after, and keep the answer on the Customer (owner,
-- 2026-10-28: "trigger a final feedback workflow from them and mark their
-- stage as lost").
--
-- Asked after, never before. The unsubscribe takes effect first, as it always
-- has (set_marketing_email); the question is optional and nothing about it can
-- delay, block or undo the unsubscribe (Singapore's Spam Control Act; Gmail's
-- and Yahoo's sender rules). It is asked on the unsubscribe page once they are
-- unsubscribed, in their account when they turn *Email me news and offers*
-- off, and by Staff recording what a customer said when they asked us to stop
-- (source `support`). A one-click unsubscribe from the mail client never opens
-- our page and is never asked; a spam complaint is never asked.
--
-- 1. customer_unsubscribe_reasons: one answer per unsubscribe, keyed by the
--    consent event it answers. Unlike a Drop-off reason it is kept on the
--    Customer, because the person is known and is told so. `other_text` only
--    with *Other*, up to 500 characters, read by Staff alone.
-- 2. record_unsubscribe_reason(customer, reason, text): records an answer for
--    the Customer's latest consent event, only when they are unsubscribed now
--    and that event unsubscribed them by the link, in their account, or at
--    their request to Staff. Answers 'recorded', or why not: 'already' (that
--    unsubscribe has its answer), 'not_unsubscribed', 'complaint',
--    'not_asked' (any other source), 'not_found'. Never writes consent.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated;
-- the function runs for the service role alone. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The answers
-- ---------------------------------------------------------------------
create table if not exists public.customer_unsubscribe_reasons (
  id               uuid        primary key default gen_random_uuid(),
  customer_id      uuid        not null references public.customers (id) on delete cascade,
  consent_event_id bigint      not null references public.customer_consent_events (id) on delete cascade,
  reason           text        not null check (reason in (
                     'too_many', 'not_relevant', 'have_what_i_need', 'not_happy', 'never_signed_up', 'other')),
  other_text       text        null check (other_text is null or char_length(other_text) between 1 and 500),
  created_at       timestamptz not null default now(),
  -- Typed words go with *Other* alone.
  check (other_text is null or reason = 'other')
);

-- At most one answer per unsubscribe.
create unique index if not exists customer_unsubscribe_reasons_event_key
  on public.customer_unsubscribe_reasons (consent_event_id);
create index if not exists customer_unsubscribe_reasons_customer_idx
  on public.customer_unsubscribe_reasons (customer_id, created_at desc);
create index if not exists customer_unsubscribe_reasons_created_at_idx
  on public.customer_unsubscribe_reasons (created_at desc);

alter table public.customer_unsubscribe_reasons enable row level security;
revoke all on public.customer_unsubscribe_reasons from anon, authenticated;
grant select, insert on public.customer_unsubscribe_reasons to service_role;

comment on table public.customer_unsubscribe_reasons is
  'Why a Customer unsubscribed from marketing email, asked after it took effect (PRD-crm-retention-loop slice 11). One per unsubscribe consent event; never asked of a spam complaint.';

-- ---------------------------------------------------------------------
-- 2. Recording an answer
-- ---------------------------------------------------------------------
create or replace function public.record_unsubscribe_reason(
  p_customer_id uuid,
  p_reason      text,
  p_text        text default null
)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_state text;
  v_event record;
  v_id    uuid;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
begin
  select c.marketing_email into v_state from customers c where c.id = p_customer_id;
  if not found then
    return 'not_found';
  end if;
  if v_state is distinct from 'unsubscribed' then
    return 'not_unsubscribed';
  end if;

  -- The unsubscribe they are answering: their latest consent change.
  select e.id, e.to_state, e.source into v_event
    from customer_consent_events e
   where e.customer_id = p_customer_id
   order by e.created_at desc, e.id desc
   limit 1;
  if v_event.id is null or v_event.to_state <> 'unsubscribed' then
    return 'not_unsubscribed';
  end if;
  if v_event.source = 'complaint' then
    return 'complaint';
  end if;
  if v_event.source not in ('unsubscribe_link', 'account', 'support') then
    return 'not_asked';
  end if;

  insert into customer_unsubscribe_reasons (customer_id, consent_event_id, reason, other_text)
  values (p_customer_id, v_event.id, p_reason, case when p_reason = 'other' then left(v_text, 500) end)
  on conflict (consent_event_id) do nothing
  returning id into v_id;

  return case when v_id is null then 'already' else 'recorded' end;
end;
$$;

revoke execute on function public.record_unsubscribe_reason(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_unsubscribe_reason(uuid, text, text) to service_role;
