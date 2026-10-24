-- Slice 10: audit entries can name the Staff profile.
do $$
begin
  assert exists (select 1 from information_schema.columns
                 where table_name = 'admin_audit_log' and column_name = 'actor_profile_id'), 'column added';
  insert into admin_audit_log (action, entity_type, actor_profile_id)
    select 'test.x', 'test', id from mp_staff where name = 'Jess' limit 1;
  assert (select actor_profile_id is not null from admin_audit_log where action = 'test.x'), 'profile recorded';
  delete from admin_audit_log where action = 'test.x';
end $$;
select 'slice 10 ok';
