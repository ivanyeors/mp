-- Slice 06 (PRD-campaign-audiences): Segments left out of a campaign's
-- audience, asserted against real Postgres
-- (20261031144834_email_campaign_exclusions.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 06 exclusions ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/campaign-audiences/assert-06-exclusions.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

insert into customer_segments (id, name, filters) values
  ('06060606-0000-4000-8000-0000000000a1', 'assert-06 pillow owners', '{"bought":"premium"}'::jsonb),
  ('06060606-0000-4000-8000-0000000000a2', 'assert-06 recent buyers', '{"last_order":"within:1"}'::jsonb),
  ('06060606-0000-4000-8000-0000000000a3', 'assert-06 staff', '{"tags":"staff"}'::jsonb),
  ('06060606-0000-4000-8000-0000000000a4', 'assert-06 test', '{"tags":"test"}'::jsonb);

insert into email_campaigns (id, name, subject, body, audience, segment_id) values
  ('06060606-0000-4000-8000-0000000000c1', 'assert-06 subscribed', 'News', 'Hello', 'subscribed', null),
  ('06060606-0000-4000-8000-0000000000c2', 'assert-06 segment', 'For some', 'Hello', 'segment', '06060606-0000-4000-8000-0000000000a1');

do $$
declare
  v_ids uuid[];
begin
  assert (select exclude_segment_ids = '{}' from email_campaigns where id = '06060606-0000-4000-8000-0000000000c1'),
    'a campaign leaves nobody out until told to';

  -- Any audience, Everyone subscribed included, takes up to 3.
  update email_campaigns
     set exclude_segment_ids = array['06060606-0000-4000-8000-0000000000a2', '06060606-0000-4000-8000-0000000000a3', '06060606-0000-4000-8000-0000000000a4']::uuid[]
   where id = '06060606-0000-4000-8000-0000000000c1'
  returning exclude_segment_ids into v_ids;
  assert v_ids[1] = '06060606-0000-4000-8000-0000000000a2', 'kept in the order chosen';

  begin
    update email_campaigns
       set exclude_segment_ids = exclude_segment_ids || '06060606-0000-4000-8000-0000000000a1'::uuid
     where id = '06060606-0000-4000-8000-0000000000c1';
    assert false, 'at most 3';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set exclude_segment_ids = array[null]::uuid[] where id = '06060606-0000-4000-8000-0000000000c1';
    assert false, 'no null';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns
       set exclude_segment_ids = array['06060606-0000-4000-8000-0000000000a3', '06060606-0000-4000-8000-0000000000a3']::uuid[]
     where id = '06060606-0000-4000-8000-0000000000c1';
    assert false, 'no Segment twice';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns
       set exclude_segment_ids = array['06060606-0000-4000-8000-0000000000a1']::uuid[]
     where id = '06060606-0000-4000-8000-0000000000c2';
    assert false, 'never the Segment it is sent to';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns
       set exclude_segment_ids = array['06060606-0000-4000-8000-0000000000ff']::uuid[]
     where id = '06060606-0000-4000-8000-0000000000c2';
    assert false, 'only a Segment that exists';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, body, audience, exclude_segment_ids)
    values ('assert-06 bad', 'S', 'B', 'subscribed', array['06060606-0000-4000-8000-0000000000fe']::uuid[]);
    assert false, 'an insert is checked too';
  exception when foreign_key_violation then null;
  end;

  update email_campaigns
     set exclude_segment_ids = array['06060606-0000-4000-8000-0000000000a2']::uuid[]
   where id = '06060606-0000-4000-8000-0000000000c2';

  -- The first wave fixes the exclusions with the audience.
  update email_campaigns set locked_at = now() where id = '06060606-0000-4000-8000-0000000000c2';
  begin
    update email_campaigns set exclude_segment_ids = '{}' where id = '06060606-0000-4000-8000-0000000000c2';
    assert false, 'exclusions are fixed once a wave was planned';
  exception when check_violation then null;
  end;
  update email_campaigns set name = 'assert-06 renamed' where id = '06060606-0000-4000-8000-0000000000c2';
  assert (select exclude_segment_ids = array['06060606-0000-4000-8000-0000000000a2']::uuid[]
            from email_campaigns where id = '06060606-0000-4000-8000-0000000000c2'),
    'the name changes, the exclusions stay';

  assert not has_function_privilege('authenticated', 'public.email_campaigns_exclusions_check()', 'execute'),
    'the trigger function is not the client''s';
  assert not has_table_privilege('authenticated', 'public.email_campaigns', 'select'), 'the table stays server-only';
end $$;

rollback;
select 'slice 06 exclusions ok';
