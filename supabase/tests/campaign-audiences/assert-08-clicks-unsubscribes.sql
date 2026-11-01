-- Clicks and unsubscribes per campaign (20261031152709; PRD-campaign-audiences
-- slice 08), asserted against real Postgres.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 08 clicks and unsubscribes ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-08-clicks-unsubscribes.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
begin
  assert not has_function_privilege('authenticated', 'public.record_campaign_click(text, timestamptz)', 'execute'),
    'authenticated cannot record a click';
  assert not has_function_privilege('anon', 'public.record_campaign_click(text, timestamptz)', 'execute'),
    'anon cannot record a click';
  assert has_function_privilege('service_role', 'public.record_campaign_click(text, timestamptz)', 'execute'),
    'the service role records clicks';
  assert not has_function_privilege('authenticated', 'public.set_marketing_email(uuid, text, text, timestamptz, uuid)', 'execute'),
    'authenticated cannot change consent';
  assert (select count(*) from pg_proc where proname = 'set_marketing_email') = 1, 'one set_marketing_email, no overload';
  assert (select count(*) from pg_proc where proname = 'finish_campaign_send') = 1, 'one finish_campaign_send, no overload';
  -- Only a hash is ever stored: the ledger has no column for the token itself.
  assert not exists (select 1 from information_schema.columns
                      where table_name = 'customer_campaign_sends' and column_name in ('click_token', 'token')),
    'no plaintext token column';
end $$;

do $$
declare
  v_camp  uuid;
  v_other uuid;
  ann     uuid;
  bea     uuid;
  s_ann   uuid;
  s_bea   uuid;
  s_fail  uuid;
  h_ann   text := encode(sha256('ann-token'::bytea), 'hex');
  h_bea   text := encode(sha256('bea-token'::bytea), 'hex');
  r       record;
  ok      boolean;
begin
  insert into email_campaigns (name, subject, body, audience) values ('assert-08c one', 'S', 'B', 'subscribed') returning id into v_camp;
  insert into email_campaigns (name, subject, body, audience) values ('assert-08c two', 'S', 'B', 'subscribed') returning id into v_other;
  insert into customers (email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
  values ('ann@assert08c.test', 'Ann', 'subscribed', 'account', now() - interval '90 days') returning id into ann;
  insert into customers (email, first_name, marketing_email, marketing_email_source, marketing_email_updated_at)
  values ('bea@assert08c.test', 'Bea', 'subscribed', 'account', now() - interval '90 days') returning id into bea;

  -- ── Finishing keeps the hash of a send that went, and only then ──────────
  select send_id into s_ann from claim_marketing_campaign_send(ann, v_camp, 'w1');
  select send_id into s_bea from claim_marketing_campaign_send(bea, v_camp, 'w1');
  assert finish_campaign_send(s_ann, true, 're_08c_ann', null, h_ann), 'finish: sent, with its hash';
  assert finish_campaign_send(s_bea, true, 're_08c_bea', null, 'NOT-A-HASH'), 'finish: sent, a malformed hash dropped';
  assert (select click_token_hash from customer_campaign_sends where id = s_ann) = h_ann, 'the hash is kept';
  assert (select click_token_hash from customer_campaign_sends where id = s_bea) is null, 'a malformed hash is not';
  update customer_campaign_sends set click_token_hash = h_bea where id = s_bea;

  insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status)
  values (bea, 'campaign:' || v_other::text, v_other, 'w1', 'pending') returning id into s_fail;
  assert finish_campaign_send(s_fail, false, null, 'timeout', encode(sha256('fail-token'::bytea), 'hex')), 'finish: failed';
  assert (select click_token_hash from customer_campaign_sends where id = s_fail) is null, 'a failed send keeps no hash';

  -- ── A click counts after 10 seconds, on a send that went ─────────────────
  update customer_campaign_sends set sent_at = now() - interval '5 seconds' where id = s_ann;
  assert not record_campaign_click(h_ann), 'within 10 seconds of the send: a link scanner, not counted';
  assert (select clicks = 0 and first_clicked_at is null from customer_campaign_sends where id = s_ann), 'nothing written';
  update customer_campaign_sends set sent_at = now() - interval '1 day' where id = s_ann;
  assert record_campaign_click(h_ann, now() - interval '2 hours'), 'a click counts';
  assert record_campaign_click(h_ann), 'a second click counts';
  assert (select clicks = 2 and first_clicked_at = now() - interval '2 hours' from customer_campaign_sends where id = s_ann),
    'two clicks, dated by the first';
  assert not record_campaign_click(encode(sha256('nobody'::bytea), 'hex')), 'an unknown token counts nothing';
  assert not record_campaign_click('ann-token'), 'a token in plaintext is never looked up';
  update customer_campaign_sends set click_token_hash = encode(sha256('fail-token'::bytea), 'hex'), status = 'failed' where id = s_fail;
  assert not record_campaign_click(encode(sha256('fail-token'::bytea), 'hex')), 'a failed send reached nobody: no click';

  begin
    update customer_campaign_sends set clicks = 1, first_clicked_at = null where id = s_bea;
    assert false, 'clicks and their first time go together';
  exception when check_violation then null;
  end;

  -- ── An unsubscribe names its send, only the Customer's own ───────────────
  ok := set_marketing_email(ann, 'unsubscribed', 'unsubscribe_link', null, s_bea);
  assert ok and (select campaign_send_id from customer_consent_events where customer_id = ann order by id desc limit 1) is null,
    'another Customer''s send is never pinned on an unsubscribe';
  perform set_marketing_email(ann, 'subscribed', 'account');
  ok := set_marketing_email(ann, 'unsubscribed', 'unsubscribe_link', null, s_ann);
  assert ok and (select campaign_send_id from customer_consent_events where customer_id = ann order by id desc limit 1) = s_ann,
    'their own send is kept on the event';
  -- Four arguments, as every older caller passes: still one function, naming nothing.
  perform set_marketing_email(ann, 'subscribed', 'account', now());
  assert (select campaign_send_id from customer_consent_events where customer_id = ann order by id desc limit 1) is null,
    'a change with no send names none';

  -- ── A spam report names its send too ─────────────────────────────────────
  select * into r from record_campaign_send_event('re_08c_bea', 'complained');
  assert r.unsubscribed, 'a complaint unsubscribes';
  assert (select campaign_send_id from customer_consent_events where customer_id = bea and source = 'complaint') = s_bea,
    'the complaint names the send it was about';

  -- ── The campaign's numbers ───────────────────────────────────────────────
  select * into r from email_campaign_stats where campaign_id = v_camp;
  assert r.clicked = 1 and r.clicks = 2, format('clicked %s, clicks %s', r.clicked, r.clicks);
  assert r.unsubscribed = 1, format('unsubscribed from its link: %s (a complaint is counted as spam, not here)', r.unsubscribed);
  assert r.complained = 1, 'the complaint is the spam count';
end $$;

select 'slice 08 clicks and unsubscribes ok';
rollback;
