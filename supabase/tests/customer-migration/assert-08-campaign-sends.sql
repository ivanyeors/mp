-- Slice 08 (PRD-shopify-customer-migration): the campaign send ledger, its
-- rule, its claims and the webhook's bounces and complaints, asserted against
-- real Postgres (20261020130000_customer_campaign_sends.sql,
-- 20261020200700_customer_overview_campaign_sends.sql).
--
-- Run FROM THE REPOSITORY ROOT (it reads campaign-cases.json beside it)
-- against a database with every migration applied (a throwaway local one,
-- never production). It prints one line, `slice 08 campaign sends ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/customer-migration/assert-08-campaign-sends.sql
--
-- "Cannot double-send" is proven by the unique key, not by timing: two dblink
-- sessions claim the same Customer and template at once, the second blocked
-- behind the first's uncommitted claim, and exactly one wins. Then the same
-- for two concurrent retries of one failed send. psql autocommits, so the
-- fixtures are visible to those sessions; the script deletes them at the end.
-- Needs a superuser (for dblink without a password) and the dblink extension.

\set ON_ERROR_STOP 1
set client_min_messages = error;
create extension if not exists dblink;

\set cases `cat supabase/tests/customer-migration/campaign-cases.json`

-- ---------------------------------------------------------------- cleanup
delete from customers where email like '%@assert08.test';
delete from customer_import_batches where file_name = 'assert-08.csv';
update site_settings set value = 'false' where key = 'migration_service_notice_enabled';

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.customer_campaign_sends'::regclass), 'ledger: RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'customer_campaign_sends'), 'ledger: no policy';
  foreach f in array array['select', 'insert', 'update', 'delete'] loop
    assert not has_table_privilege('anon', 'public.customer_campaign_sends', f), 'ledger: anon ' || f;
    assert not has_table_privilege('authenticated', 'public.customer_campaign_sends', f), 'ledger: authenticated ' || f;
  end loop;
  assert not has_table_privilege('authenticated', 'public.customer_campaign_candidates', 'select'), 'candidates: server-only';
  assert not has_table_privilege('anon', 'public.customer_campaign_candidates', 'select'), 'candidates: no anon';
  assert not has_table_privilege('authenticated', 'public.customer_campaign_wave_stats', 'select'), 'wave stats: server-only';
  assert not has_table_privilege('anon', 'public.customer_campaign_wave_stats', 'select'), 'wave stats: no anon';

  foreach f in array array[
    'public.claim_campaign_send(uuid, text, text, boolean)',
    'public.finish_campaign_send(uuid, boolean, text, text, text)',
    'public.record_campaign_send_event(text, text, timestamptz)',
    'public.campaign_send_blocker(uuid, text, boolean, timestamptz)',
    'public.campaign_service_notice_enabled()'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;

  -- Owner decision 3, seeded off.
  assert (select value from site_settings where key = 'migration_service_notice_enabled') = 'false',
    'the service notice is off until the owner chooses';
  assert not campaign_service_notice_enabled(), 'off reads as off';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('08080808-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-08.csv', repeat('8', 64), 40, '2026-10-01');

-- ------------------------------------------- the rule: campaign-cases.json
-- The same table lib/customer-migration/__tests__/campaign.test.ts runs
-- through campaignBlocker. Each case is its own Customer.
create temp table t_cases as select (:'cases')::jsonb as doc;

do $$
declare
  doc      jsonb := (select t.doc from t_cases t);
  v_now    timestamptz := (doc->>'now')::timestamptz;
  c        jsonb;
  cust     jsonb;
  s        record;
  i        int := 0;
  v_id     uuid;
  v_state  text;
  v_got    text;
  v_exp    text;
  failures text := '';
begin
  for c in select value from jsonb_array_elements(doc->'cases') loop
    i := i + 1;
    v_id := ('08080808-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    cust := c->'customer';
    v_state := cust->>'marketing_email';
    insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
    values (v_id, 'case' || i || '@assert08.test', 'Case', v_state,
            case v_state when 'subscribed' then 'shopify_import' when 'unsubscribed' then 'unsubscribe_link' end,
            case when v_state <> 'not_subscribed' then v_now - interval '30 days' end);
    if coalesce((cust->>'migrated')::boolean, true) then
      insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, claimed_at)
      values (v_id, '08080808-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-01',
              case when coalesce((cust->>'claimed')::boolean, false) then v_now - interval '1 day' end);
    end if;
    for s in select key, value from jsonb_each(coalesce(cust->'sends', '{}'::jsonb)) loop
      insert into customer_campaign_sends (customer_id, template, wave, status, sent_at, bounced_at, complained_at)
      values (v_id, s.key, 'cases', s.value->>'status',
              v_now - make_interval(secs => ((s.value->>'days_ago')::numeric * 86400)::double precision),
              case when s.value->>'status' = 'bounced' or coalesce((s.value->>'bounced')::boolean, false) then v_now end,
              case when s.value->>'status' = 'complained' or coalesce((s.value->>'complained')::boolean, false) then v_now end);
    end loop;

    v_got := campaign_send_blocker(v_id, c->>'template', coalesce((c->>'retryFailed')::boolean, false), v_now);
    v_exp := c->>'expected';
    if v_got is distinct from v_exp then
      failures := failures || format(E'\n  %s: expected %s, got %s', c->>'name', coalesce(v_exp, 'null'), coalesce(v_got, 'null'));
    end if;
  end loop;
  assert i = jsonb_array_length(doc->'cases') and i >= 30, 'every case ran: ' || i;
  assert failures = '', 'campaign_send_blocker disagrees with campaign-cases.json:' || failures;

  assert campaign_send_blocker('08080808-0000-4000-8000-000000000001', 'migration_newsletter') = 'unknown_template',
    'an unknown template is refused';
  assert campaign_send_blocker('08080808-0000-4000-8000-0000ffffffff', 'migration_announcement') = 'not_migrated',
    'no such Customer reads as not migrated';
end $$;

delete from customers where email like 'case%@assert08.test';

-- ------------------------------------------------- claims, one at a time
-- 1x: subscribed buyers. 2x: not subscribed. 3x: unsubscribed.
insert into customers (id, email, first_name, locale, marketing_email, marketing_email_source, marketing_email_updated_at) values
  ('08080808-1000-4000-8000-000000000011', 'ann@assert08.test',   'Ann',  'zh-CN', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000012', 'bea@assert08.test',   'Bea',  'en-US', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000013', 'cal@assert08.test',   'Cal',  'en-US', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000014', 'race@assert08.test',  'Race', 'en-US', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000015', 'retry@assert08.test', null,   'en-US', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000016', 'spam@assert08.test',  'Sam',  'en-US', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('08080808-1000-4000-8000-000000000021', 'dan@assert08.test',   'Dan',  'en-US', 'not_subscribed', null, null),
  ('08080808-1000-4000-8000-000000000031', 'eve@assert08.test',   'Eve',  'en-US', 'unsubscribed', 'unsubscribe_link', now() - interval '2 days');
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, shopify_orders_count)
select id, '08080808-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-01', 1
  from customers where id::text like '08080808-1000-%';

do $$
declare
  r record;
  v_send uuid;
begin
  -- Claim → finish → the same claim again sends nothing.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_announcement', 'w1');
  assert r.send_id is not null and r.blocker is null, 'claim: an eligible Customer is claimed';
  assert r.email = 'ann@assert08.test' and r.first_name = 'Ann' and r.locale = 'zh-CN', 'claim: the recipient, as they are now';
  v_send := r.send_id;
  assert (select status from customer_campaign_sends where id = v_send) = 'pending', 'claim: pending before the send';
  assert finish_campaign_send(v_send, true, 're_ann_1'), 'finish: sent';
  assert (select status = 'sent' and provider_message_id = 're_ann_1' from customer_campaign_sends where id = v_send),
    'finish: sent with the provider id';
  assert not finish_campaign_send(v_send, false, null, 'late'), 'finish: only a pending row moves';
  assert (select status from customer_campaign_sends where id = v_send) = 'sent', 'finish: a late failure changes nothing';

  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_announcement', 'w1');
  assert r.send_id is null and r.blocker = 'already_sent', 'twice: the second run is skipped';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_announcement', 'w2');
  assert r.send_id is null and r.blocker = 'already_sent', 'twice: another wave is skipped too';
  assert (select count(*) from customer_campaign_sends where customer_id = '08080808-1000-4000-8000-000000000011') = 1,
    'twice: one row';

  -- The reminder waits 7 days after the announcement.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_reminder', 'r1');
  assert r.send_id is null and r.blocker = 'announcement_too_recent', 'reminder: not before 7 days';
  update customer_campaign_sends set sent_at = now() - interval '8 days' where id = v_send;
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_reminder', 'r1');
  assert r.send_id is not null, 'reminder: after 7 days';
  perform finish_campaign_send(r.send_id, true, 're_ann_2');
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_reminder', 'r2');
  assert r.blocker = 'already_sent', 'reminder: once';

  -- Consent is re-checked at claim time.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000031', 'migration_announcement', 'w1');
  assert r.send_id is null and r.blocker = 'unsubscribed', 'unsubscribed: never the announcement';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000031', 'migration_service_notice', 'n1');
  assert r.send_id is null, 'unsubscribed: never the service notice';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000021', 'migration_announcement', 'w1');
  assert r.send_id is null and r.blocker = 'not_subscribed', 'not subscribed: never the announcement';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000021', 'migration_reminder', 'w1');
  assert r.send_id is null and r.blocker = 'not_subscribed', 'not subscribed: never the reminder';
  assert not exists (select 1 from customer_campaign_sends
                      where customer_id in ('08080808-1000-4000-8000-000000000031', '08080808-1000-4000-8000-000000000021')),
    'refused claims write nothing';

  -- Owner decision 3: off, the service notice is never claimed.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000021', 'migration_service_notice', 'n1');
  assert r.send_id is null and r.blocker = 'service_notice_off', 'decision 3: off by default';
  update site_settings set value = 'true' where key = 'migration_service_notice_enabled';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000021', 'migration_service_notice', 'n1');
  assert r.send_id is not null, 'decision 3: on, the no-consent group gets the notice';
  perform finish_campaign_send(r.send_id, true, 're_dan_1');
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000011', 'migration_service_notice', 'n1');
  assert r.blocker = 'subscribed', 'the subscribed get the announcement, not the notice';
  update site_settings set value = 'false' where key = 'migration_service_notice_enabled';

  -- A failure: kept, and retried only when asked, in its own wave.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000012', 'migration_announcement', 'w1');
  v_send := r.send_id;
  assert finish_campaign_send(v_send, false, null, 'Resend send failed (500)'), 'finish: failed';
  assert (select status = 'failed' and last_error like 'Resend%' and provider_message_id is null
            from customer_campaign_sends where id = v_send), 'finish: failed with the error';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000012', 'migration_announcement', 'w1');
  assert r.send_id is null and r.blocker = 'failed', 'failed: not retried without --retry-failed';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000012', 'migration_announcement', 'w9', true);
  assert r.send_id is null and r.blocker = 'not_failed', 'retry: only in the wave that failed';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000013', 'migration_announcement', 'w1', true);
  assert r.send_id is null and r.blocker = 'not_failed', 'retry: never adds someone new';
  assert not exists (select 1 from customer_campaign_sends where customer_id = '08080808-1000-4000-8000-000000000013'),
    'retry: wrote nothing for someone new';
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000012', 'migration_announcement', 'w1', true);
  assert r.send_id = v_send, 'retry: the same row, re-claimed';
  assert (select status = 'pending' and attempts = 2 and last_error is null from customer_campaign_sends where id = v_send),
    'retry: pending again, second attempt';
  perform finish_campaign_send(v_send, true, 're_bea_1');
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000012', 'migration_announcement', 'w1', true);
  assert r.send_id is null and r.blocker = 'already_sent', 'retry: never resends a sent one';

  -- A wave label is checked.
  begin
    perform claim_campaign_send('08080808-1000-4000-8000-000000000013', 'migration_announcement', 'w 1; drop');
    assert false, 'a malformed wave is refused';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------- two concurrent claims, one wins
do $$
begin
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table race_a as
  select * from dblink('a', $q$select * from claim_campaign_send('08080808-1000-4000-8000-000000000014', 'migration_announcement', 'w1')$q$)
    as t(send_id uuid, blocker text, email text, first_name text, locale text);

-- b starts while a's claim is uncommitted, so it must wait on the unique key.
do $$
begin
  perform dblink_send_query('b', $q$select * from claim_campaign_send('08080808-1000-4000-8000-000000000014', 'migration_announcement', 'w1-concurrent')$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'race: the second claim waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table race_b as
  select * from dblink_get_result('b') as t(send_id uuid, blocker text, email text, first_name text, locale text);

do $$
declare
  a record;
  b record;
begin
  select * into a from race_a;
  select * into b from race_b;
  assert a.send_id is not null and a.blocker is null, 'race: the first claim wins';
  assert b.send_id is null and b.blocker = 'already_sent', 'race: the second claims nothing';
  assert (select count(*) from customer_campaign_sends
           where customer_id = '08080808-1000-4000-8000-000000000014' and template = 'migration_announcement') = 1,
    'race: exactly one row, so exactly one email';
  assert (select wave from customer_campaign_sends where customer_id = '08080808-1000-4000-8000-000000000014') = 'w1',
    'race: the winner''s wave';
  perform finish_campaign_send(a.send_id, true, 're_race_1');
  -- A connection that ran dblink_send_query takes a fresh one for the next race.
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;

-- ----------------------------- two concurrent retries of one failure, one wins
do $$
declare
  r record;
begin
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000015', 'migration_announcement', 'w1');
  perform finish_campaign_send(r.send_id, false, null, 'timeout');
  perform dblink_connect('a', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_connect('b', 'dbname=' || current_database() || ' user=' || current_user);
  perform dblink_exec('a', 'begin');
end $$;
create temp table retry_a as
  select * from dblink('a', $q$select * from claim_campaign_send('08080808-1000-4000-8000-000000000015', 'migration_announcement', 'w1', true)$q$)
    as t(send_id uuid, blocker text, email text, first_name text, locale text);
do $$
begin
  perform dblink_send_query('b', $q$select * from claim_campaign_send('08080808-1000-4000-8000-000000000015', 'migration_announcement', 'w1', true)$q$);
  perform pg_sleep(0.5);
  assert dblink_is_busy('b') = 1, 'retry race: the second retry waits on the first';
  perform dblink_exec('a', 'commit');
end $$;
create temp table retry_b as
  select * from dblink_get_result('b') as t(send_id uuid, blocker text, email text, first_name text, locale text);
do $$
declare
  a record;
  b record;
begin
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
  select * into a from retry_a;
  select * into b from retry_b;
  assert a.send_id is not null, 'retry race: the first retry wins';
  assert b.send_id is null and b.blocker = 'already_sent', 'retry race: the second retries nothing';
  assert (select attempts from customer_campaign_sends where id = a.send_id) = 2, 'retry race: one retry, not two';
  assert a.first_name is null, 'a Customer with no first name';
  perform finish_campaign_send(a.send_id, true, 're_retry_1');
end $$;

-- ------------------------------------------------ bounces and complaints
do $$
declare
  r record;
  v_events int;
begin
  -- A hard bounce marks the send, once, and suppresses the Customer.
  select * into r from record_campaign_send_event('re_bea_1', 'bounced', '2026-10-21T05:00:00Z');
  assert r.send_id is not null and r.changed and not r.unsubscribed, 'bounce: recorded';
  assert (select status = 'bounced' and bounced_at = '2026-10-21T05:00:00Z' from customer_campaign_sends where provider_message_id = 're_bea_1'),
    'bounce: status and time';
  select * into r from record_campaign_send_event('re_bea_1', 'bounced');
  assert not r.changed, 'bounce: a repeat changes nothing';
  assert campaign_send_blocker('08080808-1000-4000-8000-000000000012', 'migration_reminder') = 'suppressed',
    'bounce: left out of every later wave';
  assert (select marketing_email from customers where id = '08080808-1000-4000-8000-000000000012') = 'subscribed',
    'bounce: consent is not changed';

  -- A complaint marks the send and unsubscribes, with its event.
  select * into r from claim_campaign_send('08080808-1000-4000-8000-000000000016', 'migration_announcement', 'w1');
  perform finish_campaign_send(r.send_id, true, 're_sam_1');
  select * into r from record_campaign_send_event('re_sam_1', 'complained');
  assert r.changed and r.unsubscribed, 'complaint: recorded and unsubscribed';
  assert (select status = 'complained' and complained_at is not null from customer_campaign_sends where provider_message_id = 're_sam_1'),
    'complaint: status and time';
  assert (select marketing_email = 'unsubscribed' and marketing_email_source = 'complaint'
            from customers where id = '08080808-1000-4000-8000-000000000016'), 'complaint: unsubscribed, source complaint';
  select count(*) into v_events from customer_consent_events
   where customer_id = '08080808-1000-4000-8000-000000000016' and source = 'complaint' and to_state = 'unsubscribed';
  assert v_events = 1, 'complaint: one consent event';
  select * into r from record_campaign_send_event('re_sam_1', 'complained');
  assert not r.changed and not r.unsubscribed, 'complaint: a repeat changes nothing';
  assert (select count(*) from customer_consent_events
           where customer_id = '08080808-1000-4000-8000-000000000016' and source = 'complaint') = 1,
    'complaint: still one event';

  -- A complaint after a bounce still unsubscribes.
  select * into r from record_campaign_send_event('re_bea_1', 'complained');
  assert r.changed and r.unsubscribed, 'complaint after a bounce';
  assert (select status = 'complained' and bounced_at is not null from customer_campaign_sends where provider_message_id = 're_bea_1'),
    'complaint after a bounce keeps the bounce time';

  -- Not a campaign send: no row, nothing changed.
  select count(*) into v_events from record_campaign_send_event('re_order_mail', 'bounced');
  assert v_events = 0, 'an unknown message id is ignored';
  begin
    perform record_campaign_send_event('re_ann_1', 'opened');
    assert false, 'only bounced and complained are events';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------------ what the Admin Panel reads
do $$
declare
  o record;
  c record;
  w record;
begin
  select * into o from admin_customer_overview where id = '08080808-1000-4000-8000-000000000011';
  assert o.last_campaign_sent_at = (select max(sent_at) from customer_campaign_sends
                                     where customer_id = '08080808-1000-4000-8000-000000000011'),
    'overview: the latest send';
  select * into o from admin_customer_overview where id = '08080808-1000-4000-8000-000000000013';
  assert o.last_campaign_sent_at is null, 'overview: never emailed';
  select * into o from admin_customer_overview where id = '08080808-1000-4000-8000-000000000012';
  assert o.last_campaign_sent_at is not null, 'overview: a bounced send was still sent';

  select * into c from customer_campaign_candidates where customer_id = '08080808-1000-4000-8000-000000000011';
  assert c.sends->'migration_announcement'->>'status' = 'sent', 'candidates: the announcement';
  assert c.sends->'migration_announcement'->>'wave' = 'w1', 'candidates: its wave';
  assert c.sends->'migration_reminder'->>'status' = 'sent', 'candidates: the reminder';
  assert c.locale = 'zh-CN' and c.shopify_orders_count = 1, 'candidates: locale and orders';
  select * into c from customer_campaign_candidates where customer_id = '08080808-1000-4000-8000-000000000013';
  assert c.sends = '{}'::jsonb, 'candidates: none yet';

  select * into w from customer_campaign_wave_stats where template = 'migration_announcement' and wave = 'w1';
  -- w1: Ann sent, Bea bounced then complained, Race sent, Retry sent, Sam complained.
  assert w.handed >= 5, 'wave stats: handed ' || w.handed;
  assert w.bounced >= 1 and w.complained >= 2, 'wave stats: bounces and complaints';
end $$;

-- The summary counts, with this script's rows and without them.
create temp table t_summary as select * from admin_customer_migration_summary;
delete from customers where email like '%@assert08.test';
do $$
declare
  a record;
  b record;
begin
  select * into a from t_summary;
  select * into b from admin_customer_migration_summary;
  -- Emailed: Ann, Bea, Race, Retry, Sam, Dan. Bounced: Bea. Complained: Bea, Sam.
  assert a.emailed - b.emailed = 6, 'summary: emailed ' || (a.emailed - b.emailed);
  assert a.emails_bounced - b.emails_bounced = 1, 'summary: bounced';
  assert a.emails_complained - b.emails_complained = 2, 'summary: complained';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from customer_import_batches where file_name = 'assert-08.csv';
update site_settings set value = 'false' where key = 'migration_service_notice_enabled';

select 'slice 08 campaign sends ok';
