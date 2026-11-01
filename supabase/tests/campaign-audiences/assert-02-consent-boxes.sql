-- The customisation and appointment boxes (20261031144854; PRD-campaign-audiences
-- slice 02, ADR 0039), asserted against real Postgres.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 02 consent boxes ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-02-consent-boxes.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
declare
  v_new    uuid;  -- nobody has asked
  v_left   uuid;  -- unsubscribed from an email
  v_chose  uuid;  -- subscribed from their Profile
  v_booker uuid;  -- nobody has asked; books an appointment
  src      text;
  ok       boolean;
begin
  insert into public.customers (email) values ('box-new@example.com') returning id into v_new;
  insert into public.customers (email) values ('box-left@example.com') returning id into v_left;
  insert into public.customers (email) values ('box-chose@example.com') returning id into v_chose;
  insert into public.customers (email) values ('box-booker@example.com') returning id into v_booker;
  perform public.set_marketing_email(v_left, 'unsubscribed', 'unsubscribe_link');
  perform public.set_marketing_email(v_chose, 'subscribed', 'account');

  -- Neither box ever unsubscribes anyone.
  foreach src in array array['customisation', 'appointment'] loop
    begin
      perform public.set_marketing_email(v_chose, 'unsubscribed', src);
      assert false, format('the %s box never unsubscribes', src);
    exception when invalid_parameter_value then null;
    end;
  end loop;

  -- Ticked, each subscribes someone nobody has asked, under its own source.
  ok := public.set_marketing_email(v_new, 'subscribed', 'customisation');
  assert ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_new)
    = 'subscribed/customisation', 'the customisation box subscribes someone nobody has asked';
  ok := public.set_marketing_email(v_booker, 'subscribed', 'appointment');
  assert ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_booker)
    = 'subscribed/appointment', 'the appointment box subscribes someone nobody has asked';
  assert (select count(*) from public.customer_consent_events
           where source in ('customisation', 'appointment') and from_state = 'not_subscribed' and to_state = 'subscribed') = 2,
    'one event for each';

  -- Never someone who said no, nor over a choice they made; quietly.
  foreach src in array array['customisation', 'appointment'] loop
    ok := public.set_marketing_email(v_left, 'subscribed', src);
    assert not ok and (select marketing_email || '/' || marketing_email_source from public.customers where id = v_left)
      = 'unsubscribed/unsubscribe_link', format('the %s box skips someone who unsubscribed', src);
    ok := public.set_marketing_email(v_chose, 'subscribed', src);
    assert not ok and (select marketing_email_source from public.customers where id = v_chose) = 'account',
      format('the %s box leaves their own choice as theirs', src);
  end loop;

  -- A second tick changes nothing: one event, not two.
  ok := public.set_marketing_email(v_new, 'subscribed', 'appointment');
  assert not ok and (select marketing_email_source from public.customers where id = v_new) = 'customisation',
    'a second box keeps the first source';

  -- They can still leave by the link, and only they can come back.
  ok := public.set_marketing_email(v_new, 'unsubscribed', 'unsubscribe_link');
  assert ok, 'the unsubscribe link works on a box subscription';
  ok := public.set_marketing_email(v_new, 'subscribed', 'customisation');
  assert not ok and (select marketing_email from public.customers where id = v_new) = 'unsubscribed',
    'a box never re-subscribes them';
end $$;

select 'slice 02 consent boxes ok';
rollback;
