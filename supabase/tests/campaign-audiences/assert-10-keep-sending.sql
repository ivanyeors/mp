-- Slice 10 (PRD-campaign-audiences): keep sending, asserted against real
-- Postgres (20261031155043_campaign_keep_sending.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 10 keep sending ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-10-keep-sending.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

insert into email_campaigns (id, name, subject, body, audience) values
  ('10101010-0000-4000-8000-0000000000c1', 'assert-10 draft', 'News', 'Hello', 'subscribed'),
  ('10101010-0000-4000-8000-0000000000c2', 'assert-10 started', 'News', 'Hello', 'subscribed');
update email_campaigns set locked_at = now() where id = '10101010-0000-4000-8000-0000000000c2';

do $$
declare
  v_row email_campaigns%rowtype;
begin
  select * into v_row from email_campaigns where id = '10101010-0000-4000-8000-0000000000c1';
  assert not v_row.keep_sending, 'off by default';
  assert v_row.keep_sending_daily_cap = 20, 'a cap of 20 by default';
  assert v_row.keep_sending_paused_at is null and v_row.keep_sending_paused_reason is null and v_row.keep_sending_segments is null,
    'nothing paused or approved by default';

  -- Only a campaign a person started can keep sending.
  begin
    update email_campaigns set keep_sending = true where id = '10101010-0000-4000-8000-0000000000c1';
    assert false, 'a draft cannot keep sending';
  exception when check_violation then null;
  end;

  -- A started campaign's email is fixed; its keep-sending columns are not.
  update email_campaigns
     set keep_sending = true,
         keep_sending_daily_cap = 5,
         keep_sending_segments = '{"10101010-0000-4000-8000-0000000000a1": {"filters": {"delivered": "over:60"}, "filters_version": 3}}'::jsonb
   where id = '10101010-0000-4000-8000-0000000000c2';
  update email_campaigns
     set keep_sending_paused_at = now(), keep_sending_paused_reason = 'its Segment changed'
   where id = '10101010-0000-4000-8000-0000000000c2';
  select * into v_row from email_campaigns where id = '10101010-0000-4000-8000-0000000000c2';
  assert v_row.keep_sending and v_row.keep_sending_daily_cap = 5 and v_row.keep_sending_paused_reason = 'its Segment changed',
    'a started campaign takes keep sending, a cap and a pause';
  begin
    update email_campaigns set subject = 'Changed' where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'the email stays fixed while it keeps sending';
  exception when check_violation then null;
  end;

  -- The cap is 1 to 100.
  begin
    update email_campaigns set keep_sending_daily_cap = 0 where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'a cap of 0';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set keep_sending_daily_cap = 101 where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'a cap over 100';
  exception when check_violation then null;
  end;

  -- A reason only with a pause; approved Segments only as an object.
  begin
    update email_campaigns set keep_sending_paused_at = null where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'a reason without a pause';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set keep_sending_segments = '[]'::jsonb where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'approved Segments are an object';
  exception when check_violation then null;
  end;

  -- Unlocking a campaign that keeps sending is refused twice over.
  begin
    update email_campaigns set locked_at = null where id = '10101010-0000-4000-8000-0000000000c2';
    assert false, 'the lock stays';
  exception when check_violation then null;
  end;

  -- Off clears the rest.
  update email_campaigns
     set keep_sending = false, keep_sending_paused_at = null, keep_sending_paused_reason = null, keep_sending_segments = null
   where id = '10101010-0000-4000-8000-0000000000c2';
  assert (select not keep_sending from email_campaigns where id = '10101010-0000-4000-8000-0000000000c2'), 'turned off';

  -- Still server-only.
  assert not has_table_privilege('anon', 'public.email_campaigns', 'select'), 'anon reads no campaign';
  assert not has_table_privilege('authenticated', 'public.email_campaigns', 'update'), 'a signed-in user changes no campaign';
end $$;

select 'slice 10 keep sending ok';
rollback;
