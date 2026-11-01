-- The sign-up is the Sign in (20261101031444; PRD-campaign-audiences slice 03),
-- asserted against real Postgres: the Sign in box (`sign_in`) and the footer's
-- "Get our emails" (`newsletter`) act as the other boxes do.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 03 sign-up ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-03-sign-up.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
declare
  v_new    uuid;  -- nobody has asked; signs in with the box ticked
  v_footer uuid;  -- nobody has asked; signs up in the footer
  v_left   uuid;  -- unsubscribed from an email
  v_chose  uuid;  -- subscribed from their Profile
  src      text;
  ok       boolean;
begin
  insert into public.customers (email) values ('signin-new@example.com') returning id into v_new;
  insert into public.customers (email) values ('signin-footer@example.com') returning id into v_footer;
  insert into public.customers (email) values ('signin-left@example.com') returning id into v_left;
  insert into public.customers (email) values ('signin-chose@example.com') returning id into v_chose;
  perform public.set_marketing_email(v_left, 'unsubscribed', 'unsubscribe_link');
  perform public.set_marketing_email(v_chose, 'subscribed', 'account');

  -- Neither ever unsubscribes anyone.
  foreach src in array array['sign_in', 'newsletter'] loop
    begin
      perform public.set_marketing_email(v_chose, 'unsubscribed', src);
      assert false, format('%s never unsubscribes', src);
    exception when invalid_parameter_value then null;
    end;
  end loop;

  -- Each subscribes someone nobody has asked, under its own source, with one event.
  ok := public.set_marketing_email(v_new, 'subscribed', 'sign_in');
  assert ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_new)
    = 'subscribed/sign_in', 'the Sign in box subscribes someone nobody has asked';
  ok := public.set_marketing_email(v_footer, 'subscribed', 'newsletter');
  assert ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_footer)
    = 'subscribed/newsletter', 'the footer sign-up subscribes someone nobody has asked';
  assert (select count(*) from public.customer_consent_events
           where source in ('sign_in', 'newsletter') and from_state = 'not_subscribed' and to_state = 'subscribed') = 2,
    'one event for each';

  -- Never someone who said no, nor over a choice they made; quietly.
  foreach src in array array['sign_in', 'newsletter'] loop
    ok := public.set_marketing_email(v_left, 'subscribed', src);
    assert not ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_left)
      = 'unsubscribed/unsubscribe_link', format('%s skips someone who unsubscribed', src);
    ok := public.set_marketing_email(v_chose, 'subscribed', src);
    assert not ok and (select marketing_email_source from public.customers where id = v_chose) = 'account',
      format('%s leaves their own choice as theirs', src);
  end loop;

  -- Signing in again changes nothing: one event, not two.
  ok := public.set_marketing_email(v_new, 'subscribed', 'sign_in');
  assert not ok and (select count(*) from public.customer_consent_events where customer_id = v_new) = 1,
    'a second sign-in keeps the first event';

  -- Their own Profile switch is still the only way back.
  ok := public.set_marketing_email(v_left, 'subscribed', 'account');
  assert ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_left)
    = 'subscribed/account', 'the Profile switch re-subscribes someone who left';

  -- An unknown source is still refused.
  begin
    perform public.set_marketing_email(v_new, 'subscribed', 'footer');
    assert false, 'an unknown source is refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.customers set marketing_email_source = 'footer' where id = v_new;
    assert false, 'the column refuses an unknown source';
  exception when check_violation then null;
  end;
end $$;

-- Only the service role may call it.
do $$
begin
  assert not has_function_privilege('anon', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'anon cannot call set_marketing_email';
  assert not has_function_privilege('authenticated', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'authenticated cannot call set_marketing_email';
end $$;

select 'slice 03 sign-up ok';
rollback;
