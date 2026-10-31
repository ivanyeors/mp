-- The box where people give their email, past checkout (PRD-campaign-audiences
-- slice 02; ADR 0039).
--
-- The checkout box (20261031090000) is joined by two more, each ticked by
-- default and each under its own source, so the Customer page says where a
-- person said yes and each can be counted by source:
--      customisation   the contact step of a customisation (Mpillow, Basic,
--                      Mbolster, a Paired build, an Assisted customisation)
--      appointment     booking an appointment (customisation or re-adjustment)
--
-- Both move exactly as `checkout` does: subscribe only, and only someone
-- nobody has asked. Anyone else is skipped quietly, so a box nobody unticked
-- never re-subscribes someone who said no, and never replaces a choice they
-- made. Neither ever unsubscribes anyone.
--
-- Idempotent.

-- ---------------------------------------------------------------------
-- 1. The sources
-- ---------------------------------------------------------------------
alter table public.customers drop constraint if exists customers_marketing_email_source_check;
alter table public.customers add constraint customers_marketing_email_source_check check (
  marketing_email_source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

alter table public.customer_consent_events drop constraint if exists customer_consent_events_source_check;
alter table public.customer_consent_events add constraint customer_consent_events_source_check check (
  source in (
    'shopify_import', 'import_default', 'shopify_unsubscribed', 'checkout',
    'customisation', 'appointment',
    'account', 'unsubscribe_link', 'complaint', 'support'
  )
);

-- ---------------------------------------------------------------------
-- 2. The one write path
-- ---------------------------------------------------------------------
-- As 20261031090000, with the two boxes beside `checkout`. Returns whether
-- anything changed.
create or replace function public.set_marketing_email(
  p_customer_id uuid,
  p_to          text,
  p_source      text,
  p_at          timestamptz default null
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

  update customers
     set marketing_email = p_to,
         marketing_email_source = p_source,
         marketing_email_updated_at = v_at
   where id = p_customer_id;

  insert into customer_consent_events (customer_id, channel, from_state, to_state, source, created_at)
  values (p_customer_id, 'email', v_current, p_to, p_source, v_at);

  return true;
end;
$$;

revoke execute on function public.set_marketing_email(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_marketing_email(uuid, text, text, timestamptz) to service_role;
