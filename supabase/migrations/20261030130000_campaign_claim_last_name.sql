-- Email campaigns: the send claim also returns the recipient's last name
-- (PRD-campaign-email-editor slice 13).
--
-- A block campaign's *Last name* Variable is filled per recipient from the
-- claim, as the first name already is. claim_marketing_campaign_send() is
-- 20261021100000's, unchanged but for one more column, `last_name`, after
-- `first_name`: the rule, the ledger row, the retry and every other column
-- are as they were. A function's returned columns cannot change in place, so
-- it is dropped and made again, with its grants. Idempotent.
--
-- Safe for the code deployed before it: that code reads the row's columns by
-- name and ignores the new one. Code from slice 13 run before it reads no
-- `last_name`, so the campaign's fallback words are used.

drop function if exists public.claim_marketing_campaign_send(uuid, uuid, text, boolean);

create function public.claim_marketing_campaign_send(
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
