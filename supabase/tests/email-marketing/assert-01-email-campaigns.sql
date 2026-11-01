-- Email campaigns (PRD-email-marketing): the campaigns table, its lock, the
-- widened ledger, the rule and the claims, asserted against real Postgres
-- (20261021100000_email_campaigns.sql).
--
-- Run FROM THE REPOSITORY ROOT (it reads campaign-rule-cases.json beside it)
-- against a database with every migration applied (a throwaway local one,
-- never production). It prints one line, `email campaigns ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-01-email-campaigns.sql
--
-- "Never twice" is the ledger's unique (Customer, template) key, which
-- assert-08-campaign-sends.sql already races in two sessions; a Campaign's
-- sends use that key as `campaign:<id>`, asserted here.

\set ON_ERROR_STOP 1
set client_min_messages = error;

\set cases `cat supabase/tests/email-marketing/campaign-rule-cases.json`

-- ---------------------------------------------------------------- cleanup
delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assertec.test');
delete from customer_campaign_sends where campaign_id in (select id from email_campaigns where name like 'assert-ec %');
delete from email_campaigns where name like 'assert-ec %';
delete from customers where email like '%@assertec.test';
delete from customer_segments where name = 'assert-ec segment';
delete from customer_import_batches where file_name = 'assert-ec.csv';

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
  v text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.email_campaigns'::regclass), 'campaigns: RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'email_campaigns'), 'campaigns: no policy';
  foreach f in array array['select', 'insert', 'update', 'delete'] loop
    assert not has_table_privilege('anon', 'public.email_campaigns', f), 'campaigns: anon ' || f;
    assert not has_table_privilege('authenticated', 'public.email_campaigns', f), 'campaigns: authenticated ' || f;
  end loop;
  foreach v in array array['public.marketing_campaign_candidates', 'public.email_campaign_stats'] loop
    assert not has_table_privilege('anon', v, 'select'), v || ': no anon';
    assert not has_table_privilege('authenticated', v, 'select'), v || ': server-only';
  end loop;
  foreach f in array array[
    'public.marketing_campaign_blocker(uuid, uuid, boolean)',
    'public.claim_marketing_campaign_send(uuid, uuid, text, boolean)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('ec0ec0ec-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-ec.csv', repeat('e', 64), 40, '2026-10-01');
insert into customer_segments (id, name, filters)
values ('ec0ec0ec-0000-4000-8000-0000000000a5', 'assert-ec segment', '{}'::jsonb);

insert into email_campaigns (id, name, subject, body, audience, segment_id, button_label, button_target) values
  ('ec0ec0ec-0000-4000-8000-0000000000c1', 'assert-ec imported',   'Your account is ready', 'Hello', 'imported_not_signed_in', null, 'Sign in', 'sign_in'),
  ('ec0ec0ec-0000-4000-8000-0000000000c2', 'assert-ec subscribed', 'News',                  'Hello', 'subscribed', null, null, null),
  ('ec0ec0ec-0000-4000-8000-0000000000c3', 'assert-ec segment',    'For some',              'Hello', 'segment', 'ec0ec0ec-0000-4000-8000-0000000000a5', null, null);

-- ------------------------------------------------------- the table's checks
do $$
begin
  begin
    insert into email_campaigns (name, subject, body, audience) values ('assert-ec bad', 'S', 'B', 'segment');
    assert false, 'a Segment campaign needs its Segment';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, body, audience, button_target, button_label)
    values ('assert-ec bad', 'S', 'B', 'subscribed', 'url', 'Go');
    assert false, 'a link button needs its link';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, body, audience, button_target, button_label, button_url)
    values ('assert-ec bad', 'S', 'B', 'subscribed', 'url', 'Go', 'javascript:alert(1)');
    assert false, 'a link button is https only';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, body, audience) values ('assert-ec bad', '  ', 'B', 'subscribed');
    assert false, 'a subject is required';
  exception when check_violation then null;
  end;
end $$;

-- ------------------------------------------- the rule: campaign-rule-cases.json
-- The same table lib/email-campaigns/__tests__/rules.test.ts runs through
-- composedCampaignBlocker. Each case is its own Customer.
create temp table t_cases as select (:'cases')::jsonb as doc;

do $$
declare
  doc      jsonb := (select t.doc from t_cases t);
  c        jsonb;
  cust     jsonb;
  i        int := 0;
  v_id     uuid;
  v_camp   uuid;
  v_state  text;
  v_got    text;
  v_exp    text;
  r        jsonb;
  v_other  uuid;
  failures text := '';
begin
  for c in select value from jsonb_array_elements(doc->'cases') loop
    i := i + 1;
    v_id := ('ec0ec0ec-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    v_camp := case c->>'audience'
      when 'imported_not_signed_in' then 'ec0ec0ec-0000-4000-8000-0000000000c1'
      when 'subscribed' then 'ec0ec0ec-0000-4000-8000-0000000000c2'
      else 'ec0ec0ec-0000-4000-8000-0000000000c3' end;
    cust := c->'customer';
    v_state := cust->>'marketing_email';
    insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
    values (v_id, 'case' || i || '@assertec.test', 'Case', v_state,
            case v_state when 'subscribed' then 'shopify_import' when 'unsubscribed' then 'unsubscribe_link' end,
            case when v_state <> 'not_subscribed' then now() - interval '30 days' end);
    if coalesce((cust->>'migrated')::boolean, false) then
      insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, claimed_at)
      values (v_id, 'ec0ec0ec-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-01',
              case when coalesce((cust->>'claimed')::boolean, false) then now() - interval '1 day' end);
    end if;
    -- Dated 60 days ago: suppression is forever, the rest period is not.
    if cust ? 'suppressedBy' then
      insert into customer_campaign_sends (customer_id, template, wave, status, sent_at, bounced_at, complained_at)
      values (v_id, 'migration_announcement', 'cases', cust->>'suppressedBy', now() - interval '60 days',
              case when cust->>'suppressedBy' = 'bounced' then now() end,
              case when cust->>'suppressedBy' = 'complained' then now() end);
    end if;
    -- Slice 07: their other email, each on its own day.
    for r in select value from jsonb_array_elements(coalesce(cust->'recent', '[]'::jsonb)) loop
      case coalesce(r->>'kind', 'campaign')
        when 'campaign' then
          insert into email_campaigns (name, subject, body, audience)
          values ('assert-ec rest ' || i, 'S', 'B', 'subscribed') returning id into v_other;
          insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, sent_at)
          values (v_id, 'campaign:' || v_other::text, v_other, 'cases', coalesce(r->>'status', 'sent'),
                  now() - make_interval(secs => (r->>'daysAgo')::numeric * 86400));
        when 'points_expiry' then
          insert into customer_emails (customer_id, template, entity_id, status, sent_at)
          values (v_id, 'points.expiry_1m', gen_random_uuid(), 'sent',
                  now() - make_interval(secs => (r->>'daysAgo')::numeric * 86400));
        when 'transactional' then
          insert into customer_emails (customer_id, template, entity_id, status, sent_at)
          values (v_id, 'order.confirmation', gen_random_uuid(), 'sent',
                  now() - make_interval(secs => (r->>'daysAgo')::numeric * 86400));
      end case;
    end loop;
    if cust ? 'own' then
      insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, bounced_at, complained_at)
      values (v_id, 'campaign:' || v_camp::text, v_camp, 'cases', cust->>'own',
              case when cust->>'own' = 'bounced' then now() end,
              case when cust->>'own' = 'complained' then now() end);
    end if;

    v_got := marketing_campaign_blocker(v_id, v_camp, coalesce((c->>'retryFailed')::boolean, false));
    v_exp := c->>'expected';
    if v_got is distinct from v_exp then
      failures := failures || format(E'\n  %s: expected %s, got %s', c->>'name', coalesce(v_exp, 'null'), coalesce(v_got, 'null'));
    end if;
  end loop;
  assert i = jsonb_array_length(doc->'cases') and i >= 20, 'every case ran: ' || i;
  assert failures = '', 'marketing_campaign_blocker disagrees with campaign-rule-cases.json:' || failures;

  assert marketing_campaign_blocker('ec0ec0ec-0000-4000-8000-000000000001', 'ec0ec0ec-0000-4000-8000-0000000000ff') = 'unknown_campaign',
    'an unknown campaign is refused';
  assert marketing_campaign_blocker('ec0ec0ec-0000-4000-8000-0000ffffffff', 'ec0ec0ec-0000-4000-8000-0000000000c2') = 'not_found',
    'no such Customer';
end $$;

delete from customer_campaign_sends where customer_id in (select id from customers where email like 'case%@assertec.test');
delete from customers where email like 'case%@assertec.test';

-- ------------------------------------------------- claims
insert into customers (id, email, first_name, locale, marketing_email, marketing_email_source, marketing_email_updated_at) values
  ('ec0ec0ec-1000-4000-8000-000000000011', 'ann@assertec.test', 'Ann', 'zh-CN', 'subscribed', 'shopify_import', now() - interval '20 days'),
  ('ec0ec0ec-1000-4000-8000-000000000012', 'bea@assertec.test', 'Bea', 'en-US', 'subscribed', 'account', now() - interval '20 days'),
  ('ec0ec0ec-1000-4000-8000-000000000013', 'cal@assertec.test', null,  'en-US', 'subscribed', 'shopify_import', now() - interval '20 days');
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, shopify_orders_count) values
  ('ec0ec0ec-1000-4000-8000-000000000011', 'ec0ec0ec-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-01', 2),
  ('ec0ec0ec-1000-4000-8000-000000000013', 'ec0ec0ec-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-01', 0);

do $$
declare
  r      record;
  v_send uuid;
  c_imp  uuid := 'ec0ec0ec-0000-4000-8000-0000000000c1';
  c_sub  uuid := 'ec0ec0ec-0000-4000-8000-0000000000c2';
  ann    uuid := 'ec0ec0ec-1000-4000-8000-000000000011';
  bea    uuid := 'ec0ec0ec-1000-4000-8000-000000000012';
  cal    uuid := 'ec0ec0ec-1000-4000-8000-000000000013';
begin
  -- Claim → finish → the same claim again sends nothing, in any wave.
  select * into r from claim_marketing_campaign_send(ann, c_imp, 'w1');
  assert r.send_id is not null and r.blocker is null, 'claim: an eligible Customer is claimed';
  assert r.email = 'ann@assertec.test' and r.first_name = 'Ann' and r.locale = 'zh-CN', 'claim: the recipient, as they are now';
  assert r.unclaimed_migrated, 'claim: an unclaimed Migrated customer gets a Claim link';
  v_send := r.send_id;
  assert (select template = 'campaign:' || c_imp::text and campaign_id = c_imp and status = 'pending' and wave = 'w1'
            from customer_campaign_sends where id = v_send), 'claim: the ledger row, pending, keyed by the campaign';
  assert finish_campaign_send(v_send, true, 're_ec_ann'), 'finish: sent';
  select * into r from claim_marketing_campaign_send(ann, c_imp, 'w1');
  assert r.send_id is null and r.blocker = 'already_sent', 'twice: skipped';
  select * into r from claim_marketing_campaign_send(ann, c_imp, 'w2');
  assert r.send_id is null and r.blocker = 'already_sent', 'twice: another wave is skipped too';

  -- The same Customer may get a different campaign, once they have rested
  -- (PRD-campaign-audiences slice 07): not the same day, and nothing written.
  select * into r from claim_marketing_campaign_send(ann, c_sub, 'w1');
  assert r.send_id is null and r.blocker = 'resting', 'another campaign the same day: resting';
  assert (select count(*) from customer_campaign_sends where customer_id = ann) = 1, 'resting writes no row';
  update customer_campaign_sends set sent_at = now() - interval '8 days' where id = v_send;
  select * into r from claim_marketing_campaign_send(ann, c_sub, 'w1');
  assert r.send_id is not null, 'another campaign is another send';
  perform finish_campaign_send(r.send_id, true, 're_ec_ann_2');
  assert (select count(*) from customer_campaign_sends where customer_id = ann) = 2, 'two campaigns, two rows';

  -- The imported audience: a Customer who signed up here is not in it.
  select * into r from claim_marketing_campaign_send(bea, c_imp, 'w1');
  assert r.send_id is null and r.blocker = 'not_migrated', 'imported: Bea signed up here';
  select * into r from claim_marketing_campaign_send(bea, c_sub, 'w1');
  assert r.send_id is not null and not r.unclaimed_migrated, 'subscribed: Bea gets it, with no Claim link';
  -- Failure, then a retry in a new wave, once.
  assert finish_campaign_send(r.send_id, false, null, 'timeout'), 'finish: failed';
  select * into r from claim_marketing_campaign_send(bea, c_sub, 'w2');
  assert r.send_id is null and r.blocker = 'failed', 'a failure is not retried without retry';
  select * into r from claim_marketing_campaign_send(bea, c_sub, 'w2', true);
  assert r.send_id is not null, 'retry: re-claimed';
  assert (select status = 'pending' and wave = 'w2' and attempts = 2 and last_error is null
            from customer_campaign_sends where id = r.send_id), 'retry: pending again, in the retry''s wave';
  select * into r from claim_marketing_campaign_send(bea, c_sub, 'w2', true);
  assert r.send_id is null and r.blocker = 'already_sent', 'retry: once';

  -- Consent is re-checked at claim time: Cal unsubscribes after the plan.
  perform set_marketing_email(cal, 'unsubscribed', 'unsubscribe_link', now());
  select * into r from claim_marketing_campaign_send(cal, c_imp, 'w1');
  assert r.send_id is null and r.blocker = 'unsubscribed', 'unsubscribed at claim time';
  assert not exists (select 1 from customer_campaign_sends where customer_id = cal), 'nothing written for a refusal';

  -- A complaint on a campaign suppresses the migration's own templates too.
  perform record_campaign_send_event('re_ec_ann_2', 'complained', now());
  assert campaign_send_blocker(ann, 'migration_announcement') in ('suppressed', 'unsubscribed'),
    'a complaint on a campaign suppresses the migration emails';

  -- A bad wave label is refused.
  begin
    perform claim_marketing_campaign_send(bea, c_sub, 'no spaces');
    assert false, 'a wave label is checked';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------------- the ledger's template check
do $$
begin
  begin
    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status)
    values ('ec0ec0ec-1000-4000-8000-000000000012', 'campaign:ec0ec0ec-0000-4000-8000-0000000000c3',
            'ec0ec0ec-0000-4000-8000-0000000000c2', 'w1', 'pending');
    assert false, 'a campaign send is keyed by its own campaign';
  exception when check_violation then null;
  end;
  begin
    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status)
    values ('ec0ec0ec-1000-4000-8000-000000000012', 'migration_announcement',
            'ec0ec0ec-0000-4000-8000-0000000000c2', 'w1', 'pending');
    assert false, 'a migration template has no campaign';
  exception when check_violation then null;
  end;
  begin
    insert into customer_campaign_sends (customer_id, template, wave, status)
    values ('ec0ec0ec-1000-4000-8000-000000000012', 'newsletter', 'w1', 'pending');
    assert false, 'an unknown template is refused';
  exception when check_violation then null;
  end;
  begin
    delete from email_campaigns where id = 'ec0ec0ec-0000-4000-8000-0000000000c2';
    assert false, 'a campaign with sends cannot be deleted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ------------------------------------------------- the views
do $$
declare
  v jsonb;
begin
  select campaign_sends into v from marketing_campaign_candidates where customer_id = 'ec0ec0ec-1000-4000-8000-000000000011';
  assert v->'ec0ec0ec-0000-4000-8000-0000000000c1'->>'status' = 'sent', 'candidates: sends by campaign id';
  assert (select suppressed from marketing_campaign_candidates where customer_id = 'ec0ec0ec-1000-4000-8000-000000000011'),
    'candidates: a complaint suppresses';
  assert (select migrated and orders_count = 2 from marketing_campaign_candidates where customer_id = 'ec0ec0ec-1000-4000-8000-000000000011'),
    'candidates: migrated, with Shopify orders';
  assert (select not migrated and not suppressed from marketing_campaign_candidates where customer_id = 'ec0ec0ec-1000-4000-8000-000000000012'),
    'candidates: a Customer who signed up here';

  assert (select handed = 1 and complained = 0 from email_campaign_stats where campaign_id = 'ec0ec0ec-0000-4000-8000-0000000000c1'),
    'stats: the imported campaign sent one';
  assert (select handed = 1 and complained = 1 and pending = 1 and waves = 2
            from email_campaign_stats where campaign_id = 'ec0ec0ec-0000-4000-8000-0000000000c2'),
    'stats: the subscribed campaign: one complained, one retry pending, two waves';
  assert (select handed = 0 from email_campaign_stats where campaign_id = 'ec0ec0ec-0000-4000-8000-0000000000c3'),
    'stats: a campaign with no sends reads 0';
end $$;

-- ------------------------------------------------- the lock
do $$
declare
  r record;
begin
  update email_campaigns set subject = 'Changed before sending' where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
  update email_campaigns set locked_at = now() where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
  begin
    update email_campaigns set subject = 'Changed after' where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
    assert false, 'a locked campaign keeps its subject';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set audience = 'subscribed', segment_id = null where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
    assert false, 'a locked campaign keeps its audience';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set locked_at = null where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
    assert false, 'a lock is not undone';
  exception when check_violation then null;
  end;
  update email_campaigns set name = 'assert-ec segment renamed' where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
  assert (select subject = 'Changed before sending' and name = 'assert-ec segment renamed'
            from email_campaigns where id = 'ec0ec0ec-0000-4000-8000-0000000000c3'), 'a locked campaign can be renamed';

  -- Archived: nothing more is claimed.
  update email_campaigns set archived_at = now() where id = 'ec0ec0ec-0000-4000-8000-0000000000c3';
  select * into r from claim_marketing_campaign_send('ec0ec0ec-1000-4000-8000-000000000012', 'ec0ec0ec-0000-4000-8000-0000000000c3', 'w1');
  assert r.send_id is null and r.blocker = 'campaign_archived', 'an archived campaign sends nothing';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assertec.test');
delete from email_campaigns where name like 'assert-ec %';
delete from customers where email like '%@assertec.test';
delete from customer_segments where name = 'assert-ec segment';
delete from customer_import_batches where file_name = 'assert-ec.csv';

select 'email campaigns ok';
