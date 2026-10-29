-- Email campaigns built from typed blocks (PRD-campaign-email-editor slice 03):
-- the one-of check on body and content, the content's version and size, no
-- button columns on a block campaign, and the lock on content, asserted
-- against real Postgres (20261029030000_email_campaign_content.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `email campaign content ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-03-campaign-content.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

delete from email_campaigns where name like 'assert-cc %';

do $$
declare
  v_blocks  uuid;
  v_legacy  uuid;
  v_content jsonb := '{"v": 1, "blocks": [{"id": "h", "type": "heading", "level": 1, "text": "Sleep cooler"}], "fallbacks": {}}';
  v_big     text := (select string_agg(md5(i::text), '') from generate_series(1, 9000) i);
begin
  assert (select data_type = 'jsonb' and is_nullable = 'YES' from information_schema.columns
           where table_schema = 'public' and table_name = 'email_campaigns' and column_name = 'content'), 'content: jsonb, null for legacy';
  assert (select is_nullable = 'YES' from information_schema.columns
           where table_schema = 'public' and table_name = 'email_campaigns' and column_name = 'body'), 'body: null for blocks';

  -- A block campaign: its blocks, no body, no button columns. A legacy one saves as it did.
  insert into email_campaigns (name, subject, content, audience)
  values ('assert-cc blocks', 'Sleep cooler', v_content, 'subscribed') returning id into v_blocks;
  insert into email_campaigns (name, subject, body, audience, button_label, button_target)
  values ('assert-cc legacy', 'News', 'Hello', 'subscribed', 'Sign in', 'sign_in') returning id into v_legacy;

  -- ---------------------------------------------------------- the one-of check
  begin
    insert into email_campaigns (name, subject, body, content, audience) values ('assert-cc bad', 'S', 'Hello', v_content, 'subscribed');
    assert false, 'an email is its blocks or its body, not both';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, audience) values ('assert-cc bad', 'S', 'subscribed');
    assert false, 'an email is its blocks or its body, not neither';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set body = null where id = v_legacy;
    assert false, 'a legacy campaign keeps its body until it has blocks';
  exception when check_violation then null;
  end;

  -- ---------------------------------------------------------- the content's shape
  begin
    insert into email_campaigns (name, subject, content, audience)
    values ('assert-cc bad', 'S', jsonb_set(v_content, '{v}', '2'), 'subscribed');
    assert false, 'content is version 1';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, content, audience) values ('assert-cc bad', 'S', '[]', 'subscribed');
    assert false, 'content is an object';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, content, audience)
    values ('assert-cc bad', 'S', '{"v": 1, "blocks": {}, "fallbacks": {}}', 'subscribed');
    assert false, 'its blocks are a list';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, content, audience)
    values ('assert-cc bad', 'S', jsonb_build_object('v', 1, 'blocks', jsonb_build_array(jsonb_build_object('id', 't', 'type', 'heading', 'level', 1, 'text', v_big)), 'fallbacks', '{}'::jsonb), 'subscribed');
    assert false, 'content is under 256,000 bytes';
  exception when check_violation then null;
  end;
  begin
    insert into email_campaigns (name, subject, content, audience, button_label, button_target)
    values ('assert-cc bad', 'S', v_content, 'subscribed', 'Sign in', 'sign_in');
    assert false, 'a block campaign leaves the button columns null: its buttons are blocks';
  exception when check_violation then null;
  end;

  -- ---------------------------------------------------------- Convert to blocks
  update email_campaigns set body = null, content = v_content, button_label = null, button_target = null where id = v_legacy;
  assert (select body is null and content = v_content from email_campaigns where id = v_legacy), 'an unsent legacy draft becomes blocks';

  -- ---------------------------------------------------------- the lock
  update email_campaigns set locked_at = now() where id = v_blocks;
  begin
    update email_campaigns set content = jsonb_set(content, '{blocks,0,text}', '"Changed"') where id = v_blocks;
    assert false, 'a locked campaign''s blocks are fixed';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set content = null, body = 'Hello' where id = v_blocks;
    assert false, 'a locked campaign cannot go back to a body either';
  exception when check_violation then null;
  end;
  update email_campaigns set name = 'assert-cc blocks, renamed' where id = v_blocks;
  assert (select name = 'assert-cc blocks, renamed' and content = v_content from email_campaigns where id = v_blocks),
    'a locked campaign still takes a new name';
end $$;

delete from email_campaigns where name like 'assert-cc %';

select 'email campaign content ok';
