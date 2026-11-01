-- Slice 12 (PRD-campaign-audiences): engaged and unengaged, asserted against
-- real Postgres (20261101081436_campaign_unengaged.sql). The rule's cases are
-- in campaign-rule-cases.json (assert-01-email-campaigns.sql); this checks
-- what they do not: the grants, the overview's column and the list filter, the
-- claim leaving no ledger row, the lock, and that a click or a purchase ends it.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 12 unengaged ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-12-unengaged.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
begin
  -- Server-only, as the rest of the rule.
  assert not has_function_privilege('anon', 'public.customer_unengaged(text, text, timestamptz, int, int, timestamptz)', 'execute'), 'anon runs no rule';
  assert not has_function_privilege('authenticated', 'public.customer_unengaged(text, text, timestamptz, int, int, timestamptz)', 'execute'), 'nor a signed-in user';
  assert has_function_privilege('service_role', 'public.customer_unengaged(text, text, timestamptz, int, int, timestamptz)', 'execute'), 'the server does';
  assert not has_table_privilege('authenticated', 'public.admin_customer_overview', 'select'), 'the overview stays server-only';
  assert (select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'email_campaigns' and column_name = 'include_unengaged') = 'false',
    'a campaign leaves the Unengaged out unless it says so';
end $$;

do $$
declare
  dev   uuid := '12120000-0000-4000-8000-000000000001';
  ann   uuid := '12120000-0000-4000-8000-000000000002';
  v_new uuid := '12120000-0000-4000-8000-0000000000c1';
  v_win uuid := '12120000-0000-4000-8000-0000000000c2';
  v_c   uuid;
  k     int;
  r     record;
begin
  -- Dev bought 30 months ago (At risk · Lapsed); Ann bought 2 months ago (New).
  insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at) values
    (dev, 'dev@assert12.test', 'Dev', 'subscribed', 'checkout', now() - interval '3 years'),
    (ann, 'ann@assert12.test', 'Ann', 'subscribed', 'checkout', now() - interval '3 years');
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at) values
    (dev, 'A12-1', dev, 'dev@assert12.test', 'delivered', 'SGD', 150, 150, '{}', now() - interval '30 months'),
    (ann, 'A12-2', ann, 'ann@assert12.test', 'delivered', 'SGD', 150, 150, '{}', now() - interval '2 months');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind) values
    (dev, 'P', 'Pillow', 1, 150, 150, 'goods'),
    (ann, 'P', 'Pillow', 1, 150, 150, 'goods');

  -- Six campaigns reached both; neither clicked.
  for k in 0..5 loop
    insert into email_campaigns (name, subject, body, audience) values ('assert-12 old ' || k, 'S', 'B', 'subscribed') returning id into v_c;
    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, sent_at) values
      (dev, 'campaign:' || v_c, v_c, 'w1', 'sent', now() - make_interval(days => 40 + k * 10)),
      (ann, 'campaign:' || v_c, v_c, 'w1', 'sent', now() - make_interval(days => 40 + k * 10));
  end loop;

  select * into r from admin_customer_overview where id = dev;
  assert r.lifecycle_stage = 'at_risk' and r.lifecycle_detail = 'lapsed', 'Dev is At risk · Lapsed';
  assert r.unengaged, 'Dev is Unengaged';
  assert r.marketing_email = 'subscribed', 'and still subscribed: Unengaged is not consent';
  assert not (select unengaged from admin_customer_overview where id = ann), 'Ann bought within 24 months: never Unengaged';
  -- The list filter's column (engagement=unengaged is one eq on it).
  assert (select array_agg(id) from admin_customer_overview where unengaged and email like '%@assert12.test') = array[dev],
    'the Engagement filter lists Dev alone';

  -- A new campaign leaves Dev out: no ledger row, so a later Wave reaches him if he re-engages.
  insert into email_campaigns (id, name, subject, body, audience) values (v_new, 'assert-12 new', 'S', 'B', 'subscribed');
  select * into r from claim_marketing_campaign_send(dev, v_new, 'w1');
  assert r.send_id is null and r.blocker = 'unengaged', 'the claim refuses Dev: ' || coalesce(r.blocker, 'null');
  assert not exists (select 1 from customer_campaign_sends where customer_id = dev and campaign_id = v_new), 'and writes no row';
  select * into r from claim_marketing_campaign_send(ann, v_new, 'w1');
  assert r.send_id is not null, 'Ann gets it';

  -- A win-back that includes the Unengaged reaches him.
  insert into email_campaigns (id, name, subject, body, audience, include_unengaged)
  values (v_win, 'assert-12 win-back', 'S', 'B', 'subscribed', true);
  -- Ann's claim above was a marketing email today, so only Dev is checked here.
  select * into r from claim_marketing_campaign_send(dev, v_win, 'w1');
  assert r.send_id is not null, 'the win-back claims Dev: ' || coalesce(r.blocker, 'null');

  -- The win-back is locked at its first wave: its choice cannot change.
  update email_campaigns set locked_at = now() where id = v_win;
  begin
    update email_campaigns set include_unengaged = false where id = v_win;
    assert false, 'a started campaign keeps its Include unengaged';
  exception when check_violation then null;
  end;

  -- He clicks it: he is engaged again at once (derived, never stored).
  update customer_campaign_sends set status = 'sent', first_clicked_at = now(), clicks = 1
   where customer_id = dev and campaign_id = v_win;
  assert not (select unengaged from admin_customer_overview where id = dev), 'a click ends Unengaged';
  update customer_campaign_sends set first_clicked_at = null, clicks = 0 where customer_id = dev and campaign_id = v_win;
  assert (select unengaged from admin_customer_overview where id = dev), 'six unclicked again';

  -- A purchase ends it too: he is New, which never is.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at)
  values ('12120000-0000-4000-8000-0000000000d1', 'A12-3', dev, 'dev@assert12.test', 'confirmed', 'SGD', 90, 90, '{}', now());
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)
  values ('12120000-0000-4000-8000-0000000000d1', 'C', 'Case', 1, 90, 90, 'goods');
  select * into r from admin_customer_overview where id = dev;
  assert r.lifecycle_stage = 'loyal' and not r.unengaged, 'a purchase ends Unengaged: ' || r.lifecycle_stage;
end $$;

rollback;
select 'slice 12 unengaged ok';
