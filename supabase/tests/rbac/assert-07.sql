-- Slice 07: Staff profiles under logins.
do $$
declare n int;
begin
  select count(*) into n from mp_staff s join admin_users a on a.id = s.admin_user_id
    where a.email = 'sg@mpillow.com' and s.name in ('Darren','Jess','Ivan','Kai Lin','Wang Ying','Winnie');
  assert n = 6, 'existing profiles moved under sg@mpillow.com';

  select count(*) into n from admin_users a where not exists (select 1 from mp_staff s where s.admin_user_id = a.id);
  assert n = 0, 'every Member has a profile';
  assert exists (select 1 from mp_staff s join admin_users a on a.id = s.admin_user_id
                 where a.email = 'ivanyeoart@gmail.com' and s.name = 'Ivanyeoart'), 'named from email local part';
  assert exists (select 1 from mp_staff s join admin_users a on a.id = s.admin_user_id
                 where a.email = 'fixture-viewer@example.com' and s.name = 'Fixture Viewer'), 'separators become spaces';

  select count(*) into n from mp_config_responses r join mp_staff s on s.id = r.measured_by_staff_id where s.name = 'Jess';
  assert n = 1, 'Result attribution unchanged';

  -- Same name under another Member is allowed; twice under one Member is not.
  insert into mp_staff (name, admin_user_id) select 'Jess', id from admin_users where email = 'admin@mpillow.com';
  begin
    insert into mp_staff (name, admin_user_id) select 'jess', id from admin_users where email = 'sg@mpillow.com';
    assert false, 'duplicate active name under one Member must fail';
  exception when unique_violation then null;
  end;
  -- Archiving frees the name.
  update mp_staff set archived_at = now()
    where name = 'Jess' and admin_user_id = (select id from admin_users where email = 'admin@mpillow.com');
  insert into mp_staff (name, admin_user_id) select 'Jess', id from admin_users where email = 'admin@mpillow.com';
  delete from mp_staff where admin_user_id = (select id from admin_users where email = 'admin@mpillow.com') and name = 'Jess';
end $$;
select 'slice 07 ok';
