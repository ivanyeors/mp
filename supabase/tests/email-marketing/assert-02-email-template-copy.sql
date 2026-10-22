-- Editable email copy (PRD-email-templates): the email_template_copy table,
-- asserted against real Postgres (20261021110000_email_template_copy.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `email template copy ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-02-email-template-copy.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

delete from email_template_copy where template_id like 'assert.%';

do $$
declare
  f text;
  v_before timestamptz;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.email_template_copy'::regclass), 'RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'email_template_copy'), 'no policy';
  foreach f in array array['select', 'insert', 'update', 'delete'] loop
    assert not has_table_privilege('anon', 'public.email_template_copy', f), 'anon ' || f;
    assert not has_table_privilege('authenticated', 'public.email_template_copy', f), 'authenticated ' || f;
  end loop;

  -- now() is fixed inside this transaction: insert a row dated yesterday (an
  -- insert does not run the update trigger), then edit it.
  insert into email_template_copy (template_id, copy, updated_at)
  values ('assert.order_confirmation', '{"subject": "Hi"}', now() - interval '1 day');
  select updated_at into v_before from email_template_copy where template_id = 'assert.order_confirmation';
  update email_template_copy set copy = '{"subject": "Hello"}' where template_id = 'assert.order_confirmation';
  assert (select updated_at = now() and updated_at > v_before from email_template_copy where template_id = 'assert.order_confirmation'),
    'an edit moves updated_at';

  begin
    insert into email_template_copy (template_id, copy) values ('Not An Id', '{}');
    assert false, 'an id is a dotted snake_case key';
  exception when check_violation then null;
  end;
  begin
    insert into email_template_copy (template_id, copy) values ('assert.list', '[]');
    assert false, 'copy is an object';
  exception when check_violation then null;
  end;
  begin
    insert into email_template_copy (template_id, copy) values ('assert.order_confirmation', '{}');
    assert false, 'one row per email';
  exception when unique_violation then null;
  end;
end $$;

delete from email_template_copy where template_id like 'assert.%';

select 'email template copy ok';
