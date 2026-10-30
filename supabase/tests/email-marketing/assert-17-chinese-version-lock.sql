-- A campaign's 中文 version (PRD-campaign-email-editor slice 17) lives in
-- `content.translations."zh-CN"`, so the content checks and the lock cover
-- it with no migration of its own: a draft's Chinese words save and change,
-- the size check counts them, and once the first wave is planned they are as
-- fixed as the English (20261029090701_email_campaign_content.sql's guard).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `chinese version lock ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-17-chinese-version-lock.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

delete from email_campaigns where name like 'assert-zh %';

do $$
declare
  v_id      uuid;
  v_zh      jsonb := '{"subject": "这个十二月睡得更清凉", "preheader": "", "from": "x1", "fallbacks": {"first_name": "您"},
                       "blocks": {"h": {"type": "heading", "from": "y1", "text": "睡得更清凉"}}}';
  v_content jsonb;
  v_big     text := (select string_agg(md5(i::text), '') from generate_series(1, 9000) i);
begin
  v_content := jsonb_build_object(
    'v', 1,
    'blocks', jsonb_build_array(jsonb_build_object('id', 'h', 'type', 'heading', 'level', 1, 'text', 'Sleep cooler')),
    'fallbacks', '{}'::jsonb,
    'translations', jsonb_build_object('zh-CN', v_zh));

  -- ---------------------------------------------------------- a draft's 中文 words save and change
  insert into email_campaigns (name, subject, content, audience)
  values ('assert-zh draft', 'Sleep cooler', v_content, 'subscribed') returning id into v_id;
  update email_campaigns set content = jsonb_set(content, '{translations,zh-CN,blocks,h,text}', '"睡得更凉快"') where id = v_id;
  assert (select content #>> '{translations,zh-CN,blocks,h,text}' = '睡得更凉快' from email_campaigns where id = v_id),
    'an unsent draft''s 中文 words change';

  -- ---------------------------------------------------------- the size check counts them
  begin
    update email_campaigns set content = jsonb_set(content, '{translations,zh-CN,blocks,h,text}', to_jsonb(v_big)) where id = v_id;
    assert false, 'the 中文 version counts towards the 256,000 bytes';
  exception when check_violation then null;
  end;

  -- ---------------------------------------------------------- the lock covers them
  update email_campaigns set locked_at = now() where id = v_id;
  begin
    update email_campaigns set content = jsonb_set(content, '{translations,zh-CN,subject}', '"改了"') where id = v_id;
    assert false, 'a started campaign''s 中文 subject is fixed';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set content = jsonb_set(content, '{translations,zh-CN,blocks,h,text}', '"改了"') where id = v_id;
    assert false, 'a started campaign''s 中文 words are fixed';
  exception when check_violation then null;
  end;
  begin
    update email_campaigns set content = content - 'translations' where id = v_id;
    assert false, 'a started campaign keeps its 中文 version: removing it is a change too';
  exception when check_violation then null;
  end;
  assert (select content #>> '{translations,zh-CN,blocks,h,text}' = '睡得更凉快' from email_campaigns where id = v_id),
    'the 中文 words are as they were when sending started';
  update email_campaigns set name = 'assert-zh draft, renamed' where id = v_id;
  assert (select name = 'assert-zh draft, renamed' from email_campaigns where id = v_id), 'a started campaign still takes a new name';
end $$;

delete from email_campaigns where name like 'assert-zh %';

select 'chinese version lock ok';
