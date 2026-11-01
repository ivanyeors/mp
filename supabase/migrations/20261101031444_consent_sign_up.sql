-- The sign-up is the Sign in (PRD-campaign-audiences slice 03, as redesigned
-- 2026-11-01). Two consent sources join the boxes:
--
--   sign_in     the box on the Customer tab of Sign in, ticked by default
--               (owner decision 1), with the same line as the other boxes.
--   newsletter  "Get our emails" in the site footer: the visitor types their
--               email and confirms it with the sign-in link or code.
--
-- Both are recorded only after the person has proven the address (the link,
-- the code, or Google), on their own new or found Customer, by
-- `completeSignIn` (lib/auth/complete-sign-in.ts). Both act as the boxes do:
-- they subscribe only someone nobody has asked, never unsubscribe anyone, and
-- skip anyone who chose already, quietly. Someone who unsubscribed comes back
-- only by their own Profile switch (`account`), which the page offers them
-- right after a footer sign-up.
--
-- Nothing else changes: set_marketing_email() is restated from
-- 20261031152709 with the two sources added to each list.

-- ---------------------------------------------------------------------
-- 1. The sources
-- ---------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_marketing_email_source_check;
alter table public.customers add constraint customers_marketing_email_source_check check (
  marketing_email_source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment', 'sign_in', 'newsletter',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

alter table public.customer_consent_events drop constraint if exists customer_consent_events_source_check;
alter table public.customer_consent_events add constraint customer_consent_events_source_check check (
  source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment', 'sign_in', 'newsletter',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

-- ---------------------------------------------------------------------
-- 2. The one write path
-- ---------------------------------------------------------------------
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
    'customisation', 'appointment', 'sign_in', 'newsletter',
    'account', 'unsubscribe_link', 'complaint', 'support'
  ) then
    raise exception 'Unknown consent source %', coalesce(p_source, 'null')
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'subscribed' and p_source not in (
    'account', 'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
    'sign_in', 'newsletter'
  ) then
    raise exception 'Only the customer, the import or a box they left ticked subscribes them (not %)', p_source
      using errcode = 'invalid_parameter_value';
  end if;
  if p_to = 'unsubscribed' and p_source in (
    'shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
    'sign_in', 'newsletter'
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
  -- The import, its default, the boxes and the sign-up subscribe only someone
  -- nobody has asked. The trigger would refuse an unsubscribed one; this
  -- skips it quietly, so one row does not fail an import chunk, a sale, a
  -- booking or a sign-in.
  if p_source in ('shopify_import', 'import_default', 'checkout', 'customisation', 'appointment',
                  'sign_in', 'newsletter')
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
