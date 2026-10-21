-- CRM slice 06: Follow-ups (20261020132000_customer_followups.sql) and the
-- overview's open_followups (20261020200000_customer_overview_open_followups.sql).
--
-- Run against a database with every migration applied (a local Postgres with
-- the Supabase roles, or a Supabase branch), as the owner role:
--
--   psql -v ON_ERROR_STOP=1 -q -X -f supabase/tests/crm/assert-06-followups.sql
--
-- Everything runs in one transaction that is rolled back, so it leaves no
-- rows behind. Not part of CI. A failed assert stops with its message.

begin;

-- ---------------------------------------------------------------------
-- Fixtures: one Member with two profiles, two Customers
-- ---------------------------------------------------------------------
insert into public.admin_roles (id, key, name, grants_all, permissions) values
  ('06000000-0000-4000-8000-0000000000a1', 'c06-staff', 'C06 Staff', false, array['customers', 'customers-edit']);
insert into public.admin_users (id, email, role_id) values
  ('06000000-0000-4000-8000-0000000000b1', 'c06-studio@x.test', '06000000-0000-4000-8000-0000000000a1');
insert into public.mp_staff (id, name, admin_user_id) values
  ('06000000-0000-4000-8000-0000000000c1', 'C06 Jess', '06000000-0000-4000-8000-0000000000b1'),
  ('06000000-0000-4000-8000-0000000000c2', 'C06 Kai',  '06000000-0000-4000-8000-0000000000b1');
insert into public.customers (id, email) values
  ('06000000-0000-4000-8000-0000000000d1', 'c06-mei@x.test'),
  ('06000000-0000-4000-8000-0000000000d2', 'c06-kim@x.test');

insert into public.customer_followups (id, customer_id, title, due_on, assigned_to_profile_id, created_by_profile_id, done_at, done_by_profile_id) values
  ('06000000-0000-4000-8000-0000000000e1', '06000000-0000-4000-8000-0000000000d1', 'Call about her second pillow', '2026-10-23', '06000000-0000-4000-8000-0000000000c1', '06000000-0000-4000-8000-0000000000c2', null, null),
  ('06000000-0000-4000-8000-0000000000e2', '06000000-0000-4000-8000-0000000000d1', 'Send the fill sample', '2026-10-01', '06000000-0000-4000-8000-0000000000c2', null, null, null),
  ('06000000-0000-4000-8000-0000000000e3', '06000000-0000-4000-8000-0000000000d1', 'Done already', '2026-10-01', '06000000-0000-4000-8000-0000000000c2', null, now(), '06000000-0000-4000-8000-0000000000c1');

-- ---------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into public.customer_followups (customer_id, title, due_on, assigned_to_profile_id)
    values ('06000000-0000-4000-8000-0000000000d1', '   ', '2026-10-23', '06000000-0000-4000-8000-0000000000c1');
    assert false, 'a blank title was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.customer_followups (customer_id, title, due_on, assigned_to_profile_id)
    values ('06000000-0000-4000-8000-0000000000d1', repeat('x', 201), '2026-10-23', '06000000-0000-4000-8000-0000000000c1');
    assert false, 'a 201-character title was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.customer_followups (customer_id, title, due_on, assigned_to_profile_id, done_by_profile_id)
    values ('06000000-0000-4000-8000-0000000000d1', 'Not done', '2026-10-23', '06000000-0000-4000-8000-0000000000c1', '06000000-0000-4000-8000-0000000000c1');
    assert false, 'done_by_profile_id was accepted without done_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.customer_followups (customer_id, title, due_on)
    values ('06000000-0000-4000-8000-0000000000d1', 'Nobody', '2026-10-23');
    assert false, 'a follow-up with no assignee was accepted';
  exception when not_null_violation then null;
  end;
  begin
    insert into public.customer_followups (customer_id, title, due_on, assigned_to_profile_id)
    values ('06000000-0000-4000-8000-0000000000d1', 'A Member, not a profile', '2026-10-23', '06000000-0000-4000-8000-0000000000b1');
    assert false, 'an admin_users id was accepted as the assignee';
  exception when foreign_key_violation then null;
  end;
  -- A profile with follow-ups is archived, never deleted.
  begin
    delete from public.mp_staff where id = '06000000-0000-4000-8000-0000000000c1';
    assert false, 'an assignee profile was deleted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- An archived assignee keeps its open follow-ups.
update public.mp_staff set archived_at = now() where id = '06000000-0000-4000-8000-0000000000c1';
do $$
begin
  assert (select count(*) from public.customer_followups
          where assigned_to_profile_id = '06000000-0000-4000-8000-0000000000c1' and done_at is null) = 1,
    'archiving the assignee changed its open follow-ups';
end $$;

-- ---------------------------------------------------------------------
-- The overview counts open follow-ups only
-- ---------------------------------------------------------------------
do $$
begin
  assert (select open_followups from public.admin_customer_overview
          where id = '06000000-0000-4000-8000-0000000000d1') = 2,
    'open_followups should count the two open follow-ups, not the done one';
  assert (select open_followups from public.admin_customer_overview
          where id = '06000000-0000-4000-8000-0000000000d2') = 0,
    'a Customer with no follow-ups should read 0, not null';
  assert (select pg_typeof(open_followups)::text from public.admin_customer_overview limit 1) = 'integer',
    'open_followups should be an integer';
  -- Deleting the Customer takes its follow-ups with it.
  delete from public.customers where id = '06000000-0000-4000-8000-0000000000d1';
  assert not exists (select 1 from public.customer_followups where customer_id = '06000000-0000-4000-8000-0000000000d1'),
    'a deleted Customer left follow-ups behind';
end $$;

-- ---------------------------------------------------------------------
-- Server-only: neither the anon key nor a signed-in Customer reads it
-- ---------------------------------------------------------------------
do $$
declare
  r text;
  p text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.customer_followups'::regclass),
    'RLS is off on customer_followups';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_followups'),
    'customer_followups has a policy; it should have none';
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['select', 'insert', 'update', 'delete'] loop
      assert not has_table_privilege(r, 'public.customer_followups', p), format('%s can %s customer_followups', r, p);
    end loop;
    assert not has_table_privilege(r, 'public.admin_customer_overview', 'select'),
      format('%s can select admin_customer_overview', r);
  end loop;
end $$;

set local role authenticated;
do $$
begin
  perform 1 from public.customer_followups;
  assert false, 'authenticated read customer_followups';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'slice 06 asserts ok';

rollback;
