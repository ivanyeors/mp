-- Email campaigns' send claim returns the recipient's last name, for the
-- *Last name* Variable (PRD-campaign-email-editor slice 13), and is otherwise
-- the claim it was: its columns in order, its grants, its refusals and its
-- ledger row, asserted against real Postgres
-- (20261030130000_campaign_claim_last_name.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `campaign claim last name ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-13-claim-last-name.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assertln.test');
delete from email_campaigns where name like 'assert-ln %';
delete from customers where email like '%@assertln.test';

do $$
declare
  f    text := 'public.claim_marketing_campaign_send(uuid, uuid, text, boolean)';
  cols text;
begin
  select string_agg(p.name || ' ' || format_type(p.type, null), ', ' order by p.ord) into cols
    from pg_proc fn,
         unnest(fn.proargnames, fn.proallargtypes::oid[], fn.proargmodes::text[]) with ordinality as p(name, type, mode, ord)
   where fn.oid = f::regprocedure and p.mode = 't';
  assert cols = 'send_id uuid, blocker text, email text, first_name text, last_name text, locale text, unclaimed_migrated boolean',
    'claim: its columns, last_name after first_name, the rest unchanged (' || coalesce(cols, 'none') || ')';
  assert not has_function_privilege('anon', f, 'execute'), 'claim: anon cannot execute';
  assert not has_function_privilege('authenticated', f, 'execute'), 'claim: authenticated cannot execute';
  assert has_function_privilege('service_role', f, 'execute'), 'claim: service_role executes';
end $$;

insert into email_campaigns (id, name, subject, body, audience) values
  ('1a0e1a0e-0000-4000-8000-0000000000c1', 'assert-ln subscribed', 'News', 'Hello', 'subscribed');
insert into customers (id, email, first_name, last_name, locale, marketing_email, marketing_email_source, marketing_email_updated_at) values
  ('1a0e1a0e-1000-4000-8000-000000000011', 'mei@assertln.test', 'Mei Ling', 'Tan', 'en-US', 'subscribed', 'account', now() - interval '20 days'),
  ('1a0e1a0e-1000-4000-8000-000000000012', 'nil@assertln.test', 'Nil',      null,  'zh-CN', 'subscribed', 'account', now() - interval '20 days'),
  ('1a0e1a0e-1000-4000-8000-000000000013', 'off@assertln.test', 'Off',      'Out', 'en-US', 'unsubscribed', 'account', now() - interval '20 days');

do $$
declare
  r   record;
  c   uuid := '1a0e1a0e-0000-4000-8000-0000000000c1';
  mei uuid := '1a0e1a0e-1000-4000-8000-000000000011';
  nil uuid := '1a0e1a0e-1000-4000-8000-000000000012';
  off uuid := '1a0e1a0e-1000-4000-8000-000000000013';
begin
  select * into r from claim_marketing_campaign_send(mei, c, 'w1');
  assert r.send_id is not null and r.blocker is null, 'claim: an eligible Customer is claimed';
  assert r.email = 'mei@assertln.test' and r.first_name = 'Mei Ling' and r.last_name = 'Tan' and r.locale = 'en-US',
    'claim: the recipient with their last name, as they are now';
  assert not r.unclaimed_migrated, 'claim: signed up here, so no Claim link';
  assert (select status = 'pending' and wave = 'w1' and template = 'campaign:' || c::text
            from customer_campaign_sends where id = r.send_id), 'claim: the ledger row, as before';

  select * into r from claim_marketing_campaign_send(nil, c, 'w1');
  assert r.send_id is not null and r.last_name is null and r.locale = 'zh-CN', 'claim: no last name is null, for the fallback words';

  select * into r from claim_marketing_campaign_send(mei, c, 'w2');
  assert r.send_id is null and r.blocker = 'already_sent' and r.last_name is null, 'twice: skipped, with nobody''s name';
  select * into r from claim_marketing_campaign_send(off, c, 'w1');
  assert r.send_id is null and r.blocker = 'unsubscribed' and r.last_name is null, 'a refusal carries no name';
  assert not exists (select 1 from customer_campaign_sends where customer_id = off), 'nothing written for a refusal';

  begin
    perform claim_marketing_campaign_send(nil, c, 'no spaces');
    assert false, 'a wave label is checked';
  exception when invalid_parameter_value then null;
  end;
end $$;

delete from customer_campaign_sends where customer_id in (select id from customers where email like '%@assertln.test');
delete from email_campaigns where name like 'assert-ln %';
delete from customers where email like '%@assertln.test';

select 'campaign claim last name ok';
