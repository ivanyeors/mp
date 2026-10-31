-- Clicks and unsubscribes, tied to the campaign send that caused them
-- (PRD-campaign-audiences slice 08; ADR 0038 (4)).
--
-- 1. The ledger records clicks. Each campaign send gets a click token: 32
--    random bytes the sender puts on every site link in that one email (`mc`),
--    of which only the SHA-256 is stored, as the Claim link's is. The site's
--    request proxy hashes a presented token and calls
--    record_campaign_click(), then redirects to the same address without it,
--    so the token never reaches analytics, a shared link or a screenshot.
--      click_token_hash  SHA-256 hex of the token; null before the send
--      first_clicked_at  the first counted click
--      clicks            every counted click
--    A click is counted only on a send that went out, and not within 10
--    seconds of its `sent_at`: mail filters open every link the moment it
--    arrives. A click shows the link came from that email, not who holds it
--    (emails are forwarded): it never identifies a browser or signs anyone in.
--
-- 2. finish_campaign_send() stores the hash with a successful send (one
--    more, optional, argument). A failed send keeps none.
--
-- 3. An unsubscribe names its campaign. customer_consent_events gains
--    `campaign_send_id`, and set_marketing_email() takes it as an optional
--    last argument: stored only when the send is that Customer's own, so a
--    link can never pin an unsubscribe on someone else's email. The
--    unsubscribe link carries the send, signed with the Customer
--    (lib/marketing-consent/unsubscribe.ts). A spam complaint names its send
--    too. A change with no send (the Profile, Staff, an old link) records
--    none, exactly as before.
--
-- 4. email_campaign_stats gains `clicked` (sends with a counted click),
--    `clicks`, and `unsubscribed` (people who left from this campaign's
--    unsubscribe link).
--
-- No open pixel: nothing here records an open.
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The ledger's click columns
-- ---------------------------------------------------------------------
alter table public.customer_campaign_sends
  add column if not exists click_token_hash text null,
  add column if not exists first_clicked_at timestamptz null,
  add column if not exists clicks int not null default 0;

alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_click_token_hash_shape;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_click_token_hash_shape
  check (click_token_hash is null or click_token_hash ~ '^[0-9a-f]{64}$');
alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_clicks_counted;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_clicks_counted
  check (clicks >= 0 and (clicks = 0) = (first_clicked_at is null));

create unique index if not exists customer_campaign_sends_click_token_hash_key
  on public.customer_campaign_sends (click_token_hash)
  where click_token_hash is not null;

-- ---------------------------------------------------------------------
-- 2. Finishing a send keeps its click token's hash
-- ---------------------------------------------------------------------
-- As 20261020130000, with `p_click_token_hash`. A function's arguments cannot
-- change in place, so it is dropped and made again, with its grants.
drop function if exists public.finish_campaign_send(uuid, boolean, text, text);

create or replace function public.finish_campaign_send(
  p_send_id             uuid,
  p_sent                boolean,
  p_provider_message_id text default null,
  p_error               text default null,
  p_click_token_hash    text default null
)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  with finished as (
    update customer_campaign_sends
       set status = case when p_sent then 'sent' else 'failed' end,
           provider_message_id = case when p_sent then nullif(btrim(p_provider_message_id), '') end,
           sent_at = case when p_sent then now() else sent_at end,
           last_error = case when p_sent then null else left(coalesce(nullif(p_error, ''), 'unknown error'), 1000) end,
           click_token_hash = case when p_sent and p_click_token_hash ~ '^[0-9a-f]{64}$' then p_click_token_hash end
     where id = p_send_id
       and status = 'pending'
    returning 1
  )
  select exists (select 1 from finished);
$$;

revoke execute on function public.finish_campaign_send(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_campaign_send(uuid, boolean, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 3. Recording a click
-- ---------------------------------------------------------------------
-- Whether the click counted: false for an unknown token, a send that never
-- went out, or a click within 10 seconds of the send (a link scanner).
create or replace function public.record_campaign_click(
  p_token_hash text,
  p_at         timestamptz default null
)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  with clicked as (
    update customer_campaign_sends s
       set first_clicked_at = coalesce(s.first_clicked_at, coalesce(p_at, now())),
           clicks = s.clicks + 1
     where p_token_hash ~ '^[0-9a-f]{64}$'
       and s.click_token_hash = p_token_hash
       and s.status in ('sent', 'bounced', 'complained')
       and coalesce(p_at, now()) >= s.sent_at + interval '10 seconds'
    returning 1
  )
  select exists (select 1 from clicked);
$$;

revoke execute on function public.record_campaign_click(text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_campaign_click(text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 4. A consent change may name the campaign send behind it
-- ---------------------------------------------------------------------
alter table public.customer_consent_events
  add column if not exists campaign_send_id uuid null
    references public.customer_campaign_sends(id) on delete set null;

create index if not exists customer_consent_events_campaign_send_idx
  on public.customer_consent_events (campaign_send_id)
  where campaign_send_id is not null;

-- As 20261031120000, with `p_campaign_send_id`: dropped and made again, so a
-- call with four arguments, positional or named, still finds the one function.
drop function if exists public.set_marketing_email(uuid, text, text, timestamptz);

create or replace function public.set_marketing_email(
  p_customer_id      uuid,
  p_to               text,
  p_source           text,
  p_at               timestamptz default null,
  p_campaign_send_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current        text;
  v_current_source text;
  v_at             timestamptz := coalesce(p_at, now());
  v_send           uuid;
begin
  if p_to is null or p_to not in ('subscribed', 'unsubscribed') then
    raise exception 'A consent change subscribes or unsubscribes, not %', coalesce(p_to, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source not in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment',
    'account', 'unsubscribe_link', 'complaint', 'support'
  ) then
    raise exception 'Unknown consent source %', coalesce(p_source, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'subscribed' and p_source not in (
    'account', 'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment'
  ) then
    raise exception 'Only the customer, the import or a box they left ticked subscribes them (not %)', p_source
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'unsubscribed' and p_source in (
    'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment'
  ) then
    raise exception 'The source % never unsubscribes anyone', p_source
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock the row so two changes at once cannot both see the old state.
  select marketing_email, marketing_email_source
    into v_current, v_current_source
    from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer % not found', p_customer_id using errcode = 'no_data_found';
  end if;

  if v_current = p_to then
    return false;
  end if;
  -- The import, its default and the three boxes subscribe only someone nobody
  -- has asked. The trigger would refuse an unsubscribed one; this skips it
  -- quietly, so one row does not fail an import chunk, a sale or a booking.
  if p_source in ('shopify_import', 'import_default', 'checkout', 'customisation', 'appointment')
     and v_current <> 'not_subscribed' then
    return false;
  end if;
  -- Shopify's list is older than a choice the customer made here.
  if p_source = 'shopify_unsubscribed' and v_current_source = 'account' then
    return false;
  end if;

  -- The campaign send behind it, only when it is this Customer's own.
  if p_campaign_send_id is not null then
    select s.id into v_send
      from customer_campaign_sends s
     where s.id = p_campaign_send_id and s.customer_id = p_customer_id;
  end if;

  update customers
     set marketing_email = p_to,
         marketing_email_source = p_source,
         marketing_email_updated_at = v_at
   where id = p_customer_id;

  insert into customer_consent_events (customer_id, channel, from_state, to_state, source, created_at, campaign_send_id)
  values (p_customer_id, 'email', v_current, p_to, p_source, v_at, v_send);

  return true;
end;
$$;

revoke execute on function public.set_marketing_email(uuid, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.set_marketing_email(uuid, text, text, timestamptz, uuid) to service_role;

-- As 20261020130000, with the complaint naming its send.
create or replace function public.record_campaign_send_event(
  p_provider_message_id text,
  p_event               text,
  p_at                  timestamptz default null
)
returns table (send_id uuid, customer_id uuid, changed boolean, unsubscribed boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_row     customer_campaign_sends%rowtype;
  v_at      timestamptz := coalesce(p_at, now());
  v_changed boolean := false;
  v_unsub   boolean := false;
begin
  if p_event is null or p_event not in ('bounced', 'complained') then
    raise exception 'A send event is bounced or complained, not %', coalesce(p_event, 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_row
    from customer_campaign_sends s
   where s.provider_message_id = nullif(btrim(p_provider_message_id), '')
   for update;
  if not found then
    return;
  end if;

  if p_event = 'bounced' then
    if v_row.status = 'sent' then
      update customer_campaign_sends
         set status = 'bounced', bounced_at = coalesce(bounced_at, v_at)
       where id = v_row.id;
      v_changed := true;
    end if;
  else
    if v_row.status in ('sent', 'bounced') then
      update customer_campaign_sends
         set status = 'complained', complained_at = coalesce(complained_at, v_at)
       where id = v_row.id;
      v_changed := true;
    end if;
    v_unsub := set_marketing_email(v_row.customer_id, 'unsubscribed', 'complaint', v_at, v_row.id);
  end if;

  return query select v_row.id, v_row.customer_id, v_changed, v_unsub;
end;
$$;

revoke execute on function public.record_campaign_send_event(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_campaign_send_event(text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 5. Each Campaign's numbers, with its clicks and unsubscribes
-- ---------------------------------------------------------------------
-- As 20261021100000, with three columns appended.
create or replace view public.email_campaign_stats with (security_invoker = true) as
select
  e.id as campaign_id,
  count(s.id) filter (where s.status in ('sent', 'bounced', 'complained'))       as handed,
  count(s.id) filter (where s.bounced_at is not null)                            as bounced,
  count(s.id) filter (where s.complained_at is not null)                         as complained,
  count(s.id) filter (where s.status = 'failed')                                 as failed,
  count(s.id) filter (where s.status = 'pending')                                as pending,
  count(distinct s.wave)                                                         as waves,
  min(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as first_sent_at,
  max(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as last_sent_at,
  (select count(*) from public.customer_claim_links l
    where l.template = 'campaign:' || e.id::text and l.first_clicked_at is not null) as link_clicks,
  count(s.id) filter (where s.first_clicked_at is not null)                      as clicked,
  coalesce(sum(s.clicks), 0)                                                     as clicks,
  (select count(distinct ev.customer_id)
     from public.customer_consent_events ev
     join public.customer_campaign_sends cs on cs.id = ev.campaign_send_id
    where cs.campaign_id = e.id
      and ev.to_state = 'unsubscribed'
      and ev.source = 'unsubscribe_link')                                        as unsubscribed
from public.email_campaigns e
left join public.customer_campaign_sends s on s.campaign_id = e.id
group by e.id;

revoke all on public.email_campaign_stats from anon, authenticated;
