-- A rest period between one person's marketing emails (PRD-campaign-audiences
-- slice 07; ADR 0040, decisions 1 and 5; owner decision 2 of 2026-10-31).
--
-- Running several campaigns at once must never flood one person. A Customer
-- is *resting* while either holds:
--   - a marketing email reached them in the last 7 days;
--   - 4 or more reached them in the last 30 days.
-- They are next eligible at the later of: their latest one + 7 days, and,
-- with 4 or more in the window, their 4th most recent + 30 days.
--
-- A marketing email is:
--   - any row of the campaign ledger, `customer_campaign_sends`, that was
--     handed to the provider or is being (`pending`, `sent`, `bounced`,
--     `complained`), dated `sent_at`. `pending` counts so two campaigns'
--     Waves running at once cannot both reach someone; a `failed` send
--     reached nobody and does not;
--   - a points-expiry reminder, `customer_emails` rows `points.expiry_%`
--     that were `sent`. Those keep their own schedule (they are due by date),
--     but count toward everyone else's rest.
-- Order email, the review request, the check-up and every other
-- `customer_emails` row are transactional or aftercare, and never count.
--
-- 1. marketing_rest_until(customer, now): when they are next eligible, or
--    null when they are not resting. The twin of `restUntil()` in
--    lib/email-campaigns/rules.ts, with the same constants.
-- 2. marketing_campaign_blocker(): `resting` after every other reason, so a
--    plan's counts still say *already sent* or *unsubscribed* first. The rule
--    stays the one place a send is refused (ADR 0040 (1)).
-- 3. claim_marketing_campaign_send(): locks the Customer's row before the
--    rule, so two claims for one person (two campaigns at once) are decided
--    one after the other and the second sees the first's `pending` row. A
--    resting Customer gets no ledger row: skipped, not failed, and a later
--    Wave reaches them (decision 5).
-- 4. marketing_campaign_candidates: `marketing_recent`, the times of their
--    marketing email in the last 30 days, newest first, so the plan can say
--    who rests and until when without a query per person.
--
-- A test send goes to Staff addresses through no claim, so it never rests.
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. When a Customer is next eligible
-- ---------------------------------------------------------------------
create or replace function public.marketing_recent(
  p_customer_id uuid,
  p_now         timestamptz default now()
)
returns timestamptz[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(t.at order by t.at desc), '{}'::timestamptz[])
    from (
      select s.sent_at as at
        from customer_campaign_sends s
       where s.customer_id = p_customer_id
         and s.status in ('pending', 'sent', 'bounced', 'complained')
         and s.sent_at > p_now - interval '30 days'
         and s.sent_at <= p_now
      union all
      select e.sent_at
        from customer_emails e
       where e.customer_id = p_customer_id
         and e.status = 'sent'
         and e.template like 'points.expiry\_%' escape '\'
         and e.sent_at is not null
         and e.sent_at > p_now - interval '30 days'
         and e.sent_at <= p_now
    ) t;
$$;

create or replace function public.marketing_rest_until(
  p_customer_id uuid,
  p_now         timestamptz default now()
)
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  -- REST_DAYS = 7, REST_MAX_PER_30_DAYS = 4 (lib/email-campaigns/rules.ts).
  select case when u > p_now then u end
    from (
      select greatest(
               r[1] + interval '7 days',
               case when cardinality(r) >= 4 then r[4] + interval '30 days' end
             ) as u
        from (select public.marketing_recent(p_customer_id, p_now) as r) x
    ) y;
$$;

revoke execute on function public.marketing_recent(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_recent(uuid, timestamptz) to service_role;
revoke execute on function public.marketing_rest_until(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_rest_until(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 2. The rule, with `resting` last
-- ---------------------------------------------------------------------
-- As 20261021100000, with one more reason after `already_sent`.
create or replace function public.marketing_campaign_blocker(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_retry_failed boolean default false
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when e.id is null then 'unknown_campaign'
    when e.archived_at is not null then 'campaign_archived'
    when c.id is null then 'not_found'
    when e.audience = 'imported_not_signed_in' and m.customer_id is null then 'not_migrated'
    when e.audience = 'imported_not_signed_in' and m.claimed_at is not null then 'claimed'
    when c.marketing_email = 'unsubscribed' then 'unsubscribed'
    when exists (
      select 1 from customer_campaign_sends s
       where s.customer_id = k.id
         and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
    ) then 'suppressed'
    when c.marketing_email <> 'subscribed' then 'not_subscribed'
    when own.status = 'failed' and not coalesce(p_retry_failed, false) then 'failed'
    when own.status is not null and own.status <> 'failed' then 'already_sent'
    when public.marketing_rest_until(k.id) is not null then 'resting'
    else null
  end
  from (select p_customer_id as id) k
  left join email_campaigns e on e.id = p_campaign_id
  left join customers c on c.id = k.id
  left join migrated_customers m on m.customer_id = c.id
  left join customer_campaign_sends own
    on own.customer_id = k.id and own.template = 'campaign:' || p_campaign_id::text;
$$;

revoke execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 3. The claim: one person at a time
-- ---------------------------------------------------------------------
-- As 20261030130000, with the Customer's row locked before the rule.
create or replace function public.claim_marketing_campaign_send(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_wave         text,
  p_retry_failed boolean default false
)
returns table (send_id uuid, blocker text, email text, first_name text, last_name text, locale text, unclaimed_migrated boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_blocker  text;
  v_id       uuid;
  v_template text := 'campaign:' || p_campaign_id::text;
begin
  if p_wave is null or p_wave !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then
    raise exception 'A wave is 1 to 32 letters, digits, - or _, starting with a letter or digit (not %)',
      coalesce(p_wave, 'null') using errcode = 'invalid_parameter_value';
  end if;

  -- Two campaigns claiming one person at once: the second waits here, then
  -- reads the first's `pending` row as a marketing email and rests them.
  perform 1 from customers where id = p_customer_id for update;

  v_blocker := marketing_campaign_blocker(p_customer_id, p_campaign_id, p_retry_failed);
  if v_blocker is not null then
    return query select null::uuid, v_blocker, null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if coalesce(p_retry_failed, false) then
    update customer_campaign_sends s
       set status = 'pending',
           wave = p_wave,
           sent_at = now(),
           attempts = s.attempts + 1,
           last_error = null,
           provider_message_id = null
     where s.customer_id = p_customer_id
       and s.template = v_template
       and s.status = 'failed'
    returning s.id into v_id;
  else
    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status)
    values (p_customer_id, v_template, p_campaign_id, p_wave, 'pending')
    on conflict (customer_id, template) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    return query select null::uuid, 'already_sent'::text, null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  return query
    select v_id, null::text, c.email, c.first_name, c.last_name, c.locale,
           (m.customer_id is not null and m.claimed_at is null)
      from customers c
      left join migrated_customers m on m.customer_id = c.id
     where c.id = p_customer_id;
end;
$$;

revoke execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 4. The plan's view: each Customer's recent marketing email
-- ---------------------------------------------------------------------
-- As 20261021100000, with `marketing_recent` appended.
create or replace view public.marketing_campaign_candidates with (security_invoker = true) as
select
  c.id as customer_id,
  c.email,
  c.first_name,
  c.locale,
  c.marketing_email,
  (m.customer_id is not null) as migrated,
  m.claimed_at,
  coalesce(m.shopify_orders_count, 0) + coalesce(c.total_orders, 0) as orders_count,
  coalesce(m.imported_at, c.created_at) as since,
  exists (
    select 1 from public.customer_campaign_sends s
     where s.customer_id = c.id
       and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
  ) as suppressed,
  coalesce(
    (select jsonb_object_agg(s.campaign_id::text, jsonb_build_object(
              'status', s.status,
              'wave', s.wave,
              'sent_at', s.sent_at))
       from public.customer_campaign_sends s
      where s.customer_id = c.id and s.campaign_id is not null),
    '{}'::jsonb
  ) as campaign_sends,
  public.marketing_recent(c.id) as marketing_recent
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.marketing_campaign_candidates from anon, authenticated;
