-- PRD-crm-retention-loop slice 11: why they unsubscribe, asserted against
-- real Postgres (20261101140000_unsubscribe_reasons.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 11 unsubscribe reasons ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/crm/assert-11-unsubscribe-reasons.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
declare
  f text;
begin
  -- Server-only.
  assert (select relrowsecurity from pg_class where oid = 'public.customer_unsubscribe_reasons'::regclass), 'RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'customer_unsubscribe_reasons'), 'no policy';
  foreach f in array array['select', 'insert', 'update', 'delete'] loop
    assert not has_table_privilege('anon', 'public.customer_unsubscribe_reasons', f), 'anon ' || f;
    assert not has_table_privilege('authenticated', 'public.customer_unsubscribe_reasons', f), 'authenticated ' || f;
  end loop;
  assert not has_function_privilege('anon', 'public.record_unsubscribe_reason(uuid, text, text)', 'execute'), 'anon records nothing';
  assert not has_function_privilege('authenticated', 'public.record_unsubscribe_reason(uuid, text, text)', 'execute'), 'nor a signed-in user';
  assert has_function_privilege('service_role', 'public.record_unsubscribe_reason(uuid, text, text)', 'execute'), 'the server does';
end $$;

do $$
declare
  ann uuid := '11110000-0000-4000-8000-0000000000a1';
  bob uuid := '11110000-0000-4000-8000-0000000000b1';
  cat uuid := '11110000-0000-4000-8000-0000000000c1';
  v_first bigint;
begin
  insert into customers (id, email, first_name) values
    (ann, 'ann@assert-r11.test', 'Ann'),
    (bob, 'bob@assert-r11.test', 'Bob'),
    (cat, 'cat@assert-r11.test', 'Cat');
  perform set_marketing_email(ann, 'subscribed', 'account', now() - interval '2 days');
  perform set_marketing_email(bob, 'subscribed', 'account', now() - interval '2 days');
  perform set_marketing_email(cat, 'subscribed', 'account', now() - interval '2 days');

  -- Nothing to answer while subscribed: the question comes after the unsubscribe.
  assert record_unsubscribe_reason(ann, 'too_many') = 'not_unsubscribed', 'asked only after';
  assert not exists (select 1 from customer_unsubscribe_reasons where customer_id = ann), 'and nothing stored';

  -- Ann leaves by the link and answers; the unsubscribe stands whatever she says.
  perform set_marketing_email(ann, 'unsubscribed', 'unsubscribe_link', now() - interval '1 hour');
  assert record_unsubscribe_reason(ann, 'too_many', 'ignored without Other') = 'recorded', 'Ann answers';
  assert (select other_text from customer_unsubscribe_reasons where customer_id = ann) is null, 'words go with Other alone';
  assert (select marketing_email from customers where id = ann) = 'unsubscribed', 'an answer never changes consent';
  -- At most once per unsubscribe.
  assert record_unsubscribe_reason(ann, 'not_relevant') = 'already', 'a second answer is already recorded';
  assert (select count(*) from customer_unsubscribe_reasons where customer_id = ann) = 1, 'one answer';
  assert (select reason from customer_unsubscribe_reasons where customer_id = ann) = 'too_many', 'the first answer stays';
  select consent_event_id into v_first from customer_unsubscribe_reasons where customer_id = ann;

  -- She subscribes again, then turns it off in her account: a new unsubscribe, a new answer.
  perform set_marketing_email(ann, 'subscribed', 'account', now() - interval '30 minutes');
  assert record_unsubscribe_reason(ann, 'other') = 'not_unsubscribed', 'not while subscribed again';
  perform set_marketing_email(ann, 'unsubscribed', 'account', now() - interval '10 minutes');
  assert record_unsubscribe_reason(ann, 'other', '  Moving overseas  ') = 'recorded', 'the account unsubscribe has its own answer';
  assert (select count(*) from customer_unsubscribe_reasons where customer_id = ann) = 2, 'two unsubscribes, two answers';
  assert (select other_text from customer_unsubscribe_reasons where customer_id = ann and consent_event_id <> v_first) = 'Moving overseas',
    'Other keeps their words, trimmed';

  -- Bob marked a campaign as spam: never asked.
  perform set_marketing_email(bob, 'unsubscribed', 'complaint', now() - interval '1 hour');
  assert record_unsubscribe_reason(bob, 'too_many') = 'complaint', 'a complaint is never asked';
  assert not exists (select 1 from customer_unsubscribe_reasons where customer_id = bob), 'nothing stored for Bob';

  -- Cat asked Staff to stop; Staff record what she said.
  perform set_marketing_email(cat, 'unsubscribed', 'support', now() - interval '1 hour');
  assert record_unsubscribe_reason(cat, 'have_what_i_need') = 'recorded', 'Staff record a support request''s reason';

  -- Checks the table holds whatever the caller.
  begin
    insert into customer_unsubscribe_reasons (customer_id, consent_event_id, reason)
    values (cat, v_first, 'discount_please');
    assert false, 'an unknown reason is refused';
  exception when check_violation then null;
  end;
  begin
    insert into customer_unsubscribe_reasons (customer_id, consent_event_id, reason, other_text)
    values (cat, v_first + 100000, 'too_many', 'words');
    assert false, 'words without Other are refused';
  exception when check_violation or foreign_key_violation then null;
  end;
  begin
    insert into customer_unsubscribe_reasons (customer_id, consent_event_id, reason, other_text)
    values (cat, v_first, 'other', repeat('x', 501));
    assert false, 'over 500 characters is refused';
  exception when check_violation then null;
  end;

  assert record_unsubscribe_reason('11110000-0000-4000-8000-0000000000ff', 'too_many') = 'not_found', 'no such Customer';

  -- A deleted Customer takes their answers with them.
  delete from customers where id = cat;
  assert not exists (select 1 from customer_unsubscribe_reasons where customer_id = cat), 'gone with the Customer';
end $$;

rollback;
select 'slice 11 unsubscribe reasons ok';
