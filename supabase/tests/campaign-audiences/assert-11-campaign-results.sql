-- Slice 11 (PRD-campaign-audiences): results per campaign and the holdout,
-- asserted against real Postgres (20261031162653_campaign_results.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 11 campaign results ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-11-campaign-results.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
begin
  -- Server-only, as the ledger.
  assert not has_table_privilege('anon', 'public.email_campaign_send_outcomes', 'select'), 'anon reads no outcome';
  assert not has_table_privilege('authenticated', 'public.email_campaign_stage_results', 'select'), 'a signed-in user reads no result';
  assert not has_function_privilege('authenticated', 'public.campaign_holdout_bucket(uuid)', 'execute'), 'nor the bucket';
  -- The bucket is pinned: lib/email-campaigns/__tests__/results.test.ts holds the same numbers.
  assert campaign_holdout_bucket('00000000-0000-4000-8000-000000000001') = 49, 'bucket of …0001';
  assert campaign_holdout_bucket('11111111-0000-4000-8000-000000000001') = 5, 'bucket of 1111…0001: held out';
  assert campaign_holdout_bucket('11111111-0000-4000-8000-000000000002') = 38, 'bucket of 1111…0002: sent';
  assert (select holdout_bucket from marketing_campaign_candidates limit 1) is not distinct from
         (select campaign_holdout_bucket(customer_id) from marketing_campaign_candidates limit 1),
    'candidates carry the bucket';
end $$;

-- ── Purchases after a campaign, by the stage at send ──────────────────────
do $$
declare
  v_camp uuid;
  ann    uuid;
  bea    uuid;
  cal    uuid;
  s_ann  uuid;
  s_bea  uuid;
  s_cal  uuid;
  v_sent timestamptz := now() - interval '10 days';
  r      record;
begin
  insert into email_campaigns (name, subject, body, audience) values ('assert-11 results', 'S', 'B', 'subscribed') returning id into v_camp;
  insert into customers (email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
  values ('ann@assert11.test', 'Ann', 'subscribed', 'account', now() - interval '200 days') returning id into ann;
  insert into customers (email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
  values ('bea@assert11.test', 'Bea', 'subscribed', 'account', now() - interval '200 days') returning id into bea;
  insert into customers (email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
  values ('cal@assert11.test', 'Cal', 'subscribed', 'account', now() - interval '200 days') returning id into cal;

  -- Ann bought once, 100 days ago: New when sent.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at)
  values ('11110000-1000-4000-8000-000000000001', 'A11-1', ann, 'ann@assert11.test', 'delivered', 'SGD', 150, 150, '{}', now() - interval '100 days');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)
  values ('11110000-1000-4000-8000-000000000001', 'P', 'Pillow', 1, 150, 150, 'goods');

  select send_id into s_ann from claim_marketing_campaign_send(ann, v_camp, 'w1');
  select send_id into s_bea from claim_marketing_campaign_send(bea, v_camp, 'w1');
  select send_id into s_cal from claim_marketing_campaign_send(cal, v_camp, 'w1');
  assert (select stage_at_send from customer_campaign_sends where id = s_ann) = 'new', 'the stage when sent: New';
  assert (select stage_at_send from customer_campaign_sends where id = s_bea) = 'lead', 'the stage when sent: Lead';
  perform finish_campaign_send(s_ann, true, 're_11_ann');
  perform finish_campaign_send(s_bea, true, 're_11_bea');
  perform finish_campaign_send(s_cal, true, 're_11_cal');
  update customer_campaign_sends set sent_at = v_sent where id in (s_ann, s_bea);
  update customer_campaign_sends set sent_at = now() - interval '45 days' where id = s_cal;
  update customer_campaign_sends set first_clicked_at = v_sent + interval '1 day', clicks = 1 where id = s_ann;

  -- Ann: a Purchase 5 days after (S$200, S$20 of it refunded), after her click.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, amount_refunded, shipping_address, paid_at) values
    ('11110000-1000-4000-8000-000000000002', 'A11-2', ann, 'ann@assert11.test', 'partially_refunded', 'SGD', 200, 200, 20, '{}', v_sent + interval '5 days');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)
  values ('11110000-1000-4000-8000-000000000002', 'P', 'Pillow', 1, 200, 200, 'goods');
  -- Bea: a re-adjustment fee (service lines only), a cancelled Order, and one 40 days after: none counts.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at) values
    ('11110000-1000-4000-8000-000000000003', 'A11-3', bea, 'bea@assert11.test', 'confirmed', 'SGD', 40, 40, '{}', v_sent + interval '3 days'),
    ('11110000-1000-4000-8000-000000000004', 'A11-4', bea, 'bea@assert11.test', 'cancelled', 'SGD', 90, 90, '{}', v_sent + interval '4 days'),
    ('11110000-1000-4000-8000-000000000005', 'A11-5', bea, 'bea@assert11.test', 'delivered', 'SGD', 90, 90, '{}', v_sent + interval '40 days');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind, service_key)
  select '11110000-1000-4000-8000-000000000003', 'SERVICE', 'Re-adjustment', 1, 40, 40, 'service', key from service_prices limit 1;
  assert exists (select 1 from order_items where order_id = '11110000-1000-4000-8000-000000000003'), 'the fee Order has its service line';
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind) values
    ('11110000-1000-4000-8000-000000000004', 'C', 'Case', 1, 90, 90, 'goods'),
    ('11110000-1000-4000-8000-000000000005', 'C', 'Case', 1, 90, 90, 'goods');
  -- Cal left from this campaign's unsubscribe link.
  perform set_marketing_email(cal, 'unsubscribed', 'unsubscribe_link', now() - interval '44 days', s_cal);

  select * into r from email_campaign_send_outcomes where send_id = s_ann;
  assert r.purchases = 1 and r.spent = 180 and r.bought_after_click and r.counting and not r.held_out,
    'Ann bought within 30 days, net of the refund, after her click';
  select * into r from email_campaign_send_outcomes where send_id = s_bea;
  assert r.purchases = 0 and r.spent = 0 and not r.bought_after_click,
    'a re-adjustment fee, a cancelled Order and one past 30 days are not purchases after it';
  select * into r from email_campaign_send_outcomes where send_id = s_cal;
  assert r.unsubscribed and not r.counting, 'Cal unsubscribed from it; his 30 days are over';

  select * into r from email_campaign_stats where campaign_id = v_camp;
  assert r.handed = 3 and r.bought = 1 and r.bought_after_click = 1 and r.bought_total = 180
     and r.counting = 2 and r.held_out = 0 and r.unsubscribed = 1 and r.waves = 1,
    format('the campaign''s numbers: %s', row_to_json(r));

  select * into r from email_campaign_stage_results where campaign_id = v_camp and cohort = 'sent' and stage = 'new';
  assert r.people = 1 and r.bought = 1 and r.bought_total = 180 and r.clicked = 1, 'New: one sent, one bought';
  select * into r from email_campaign_stage_results where campaign_id = v_camp and cohort = 'sent' and stage = 'lead';
  assert r.people = 2 and r.bought = 0 and r.unsubscribed = 1, 'Lead: two sent, one left';
  assert not exists (select 1 from email_campaign_stage_results where campaign_id = v_camp and cohort <> 'sent'),
    'no holdout, no holdout rows';

  -- A send from before stages were kept reads as unknown.
  update customer_campaign_sends set stage_at_send = null where id = s_bea;
  assert exists (select 1 from email_campaign_stage_results where campaign_id = v_camp and stage = 'unknown' and people = 1),
    'no stage kept: unknown';
  begin
    update customer_campaign_sends set stage_at_send = 'churned' where id = s_bea;
    assert false, 'a stage is one of the five';
  exception when check_violation then null;
  end;
end $$;

-- ── The holdout ───────────────────────────────────────────────────────────
do $$
declare
  v_camp uuid;
  hol    uuid := '11111111-0000-4000-8000-000000000001';  -- bucket 5: held out
  sen    uuid := '11111111-0000-4000-8000-000000000002';  -- bucket 38: sent
  r      record;
  s_sen  uuid;
begin
  insert into email_campaigns (name, subject, body, audience) values ('assert-11 holdout', 'S', 'B', 'subscribed') returning id into v_camp;
  insert into customers (id, email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at) values
    (hol, 'hol@assert11.test', 'Hol', 'subscribed', 'account', now() - interval '200 days'),
    (sen, 'sen@assert11.test', 'Sen', 'subscribed', 'account', now() - interval '200 days');

  -- Only a campaign that keeps sending may hold out.
  begin
    update email_campaigns set holdout_at = now() where id = v_camp;
    assert false, 'a holdout needs keep sending';
  exception when check_violation then null;
  end;
  update email_campaigns set locked_at = now(), keep_sending = true where id = v_camp;
  update email_campaigns set holdout_at = now() where id = v_camp;
  begin
    update email_campaigns set keep_sending = false where id = v_camp;
    assert false, 'turning keep sending off clears the holdout first';
  exception when check_violation then null;
  end;

  -- The bucket under 10 is held out: a ledger row, no email.
  select * into r from claim_marketing_campaign_send(hol, v_camp, 'daily-2026-11-01');
  assert r.send_id is null and r.blocker = 'held_out' and r.email is null, 'held out: no send to make';
  select * into r from customer_campaign_sends where customer_id = hol and campaign_id = v_camp;
  assert r.status = 'held_out' and r.stage_at_send = 'lead' and r.wave = 'daily-2026-11-01', 'recorded, with the stage';
  assert not finish_campaign_send(r.id, true, 're_never'), 'a held-out row is never finished as sent';
  assert marketing_rest_until(hol) is null, 'held out is not emailed: no rest';
  assert marketing_campaign_blocker(hol, v_camp) = 'held_out', 'the rule says held out';

  -- The rest are sent as before.
  select send_id into s_sen from claim_marketing_campaign_send(sen, v_camp, 'daily-2026-11-01');
  assert s_sen is not null, 'the bucket at 10 or more is sent';
  perform finish_campaign_send(s_sen, true, 're_11_sen');

  -- Never that campaign, by a later Wave either, even with the holdout off.
  update email_campaigns set holdout_at = null where id = v_camp;
  select * into r from claim_marketing_campaign_send(hol, v_camp, 'w2');
  assert r.send_id is null and r.blocker = 'held_out', 'a later manual Wave does not reach the holdout';
  select * into r from claim_marketing_campaign_send(hol, v_camp, 'w3', true);
  assert r.send_id is null and r.blocker = 'held_out', 'nor a retry of failed sends';

  -- Counted apart from everything sent.
  select * into r from email_campaign_stats where campaign_id = v_camp;
  assert r.handed = 1 and r.held_out = 1 and r.pending = 0 and r.waves = 1, format('held out apart: %s', row_to_json(r));
  select * into r from customer_campaign_wave_stats where template = 'campaign:' || v_camp::text and wave = 'daily-2026-11-01';
  assert r.handed = 1 and r.held_out = 1, 'the wave says one held out';

  -- Compared on the same 30 days: the held out who bought, beside those sent since.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at)
  values ('11110000-1000-4000-8000-000000000011', 'A11-11', hol, 'hol@assert11.test', 'confirmed', 'SGD', 120, 120, '{}', now() + interval '1 minute');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)
  values ('11110000-1000-4000-8000-000000000011', 'P', 'Pillow', 1, 120, 120, 'goods');
  select * into r from email_campaign_stage_results where campaign_id = v_camp and cohort = 'held_out';
  assert r.people = 1 and r.bought = 1 and r.bought_total = 120, 'the held out, and what they bought';
  select * into r from email_campaign_stage_results where campaign_id = v_camp and cohort = 'sent_since_holdout';
  assert r.people = 1 and r.bought = 0, 'those sent since the holdout began';
  assert (select bought from email_campaign_stats where campaign_id = v_camp) = 0, 'a held-out purchase is not the campaign''s';

  -- The row's shape.
  begin
    update customer_campaign_sends set provider_message_id = 're_x' where customer_id = hol and campaign_id = v_camp;
    assert false, 'a held-out row has no provider message';
  exception when check_violation then null;
  end;
  begin
    insert into customer_campaign_sends (customer_id, template, wave, status)
    values (sen, 'migration_announcement', 'w1', 'held_out');
    assert false, 'the migration''s templates hold nobody out';
  exception when check_violation then null;
  end;
end $$;

select 'slice 11 campaign results ok';
rollback;
