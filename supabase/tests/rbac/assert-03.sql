-- Slice 03: roles are data.
do $$
declare n int;
begin
  -- Seeds
  select count(*) into n from admin_roles where key in ('owner','admin') and is_system and grants_all;
  assert n = 2, 'owner and admin are system grants_all roles';
  select count(*) into n from admin_roles where key in ('manager','fulfilment','viewer') and not is_system and not grants_all;
  assert n = 3, 'manager, fulfilment, viewer are custom roles';
  assert (select permissions from admin_roles where key = 'viewer') = array['orders','returns','analytics'],
    'viewer keeps its expanded keys';

  -- Backfill: owners stay Owner, everyone else is Admin.
  select count(*) into n from admin_users a join admin_roles r on r.id = a.role_id
    where a.email in ('sg@mpillow.com','ivanyeoart@gmail.com','admin@mpillow.com') and r.key = 'owner';
  assert n = 3, 'the three live owners stay Owner';
  assert (select r.key from admin_users a join admin_roles r on r.id = a.role_id
          where a.email = 'fixture-viewer@example.com') = 'admin', 'a non-owner becomes Admin';
  assert (select role from admin_users where email = 'fixture-viewer@example.com') = 'admin',
    'legacy column mirrors the new role';
  select count(*) into n from admin_users where role_id is null;
  assert n = 0, 'every Member has a role';

  -- Legacy writer (app from before the migration): role text only.
  insert into admin_users (email, role) values ('legacy-staff@example.com', 'staff');
  assert (select r.key from admin_users a join admin_roles r on r.id = a.role_id
          where a.email = 'legacy-staff@example.com') = 'fulfilment', 'legacy staff maps to Fulfilment';
  update admin_users set role = 'viewer' where email = 'legacy-staff@example.com';
  assert (select r.key from admin_users a join admin_roles r on r.id = a.role_id
          where a.email = 'legacy-staff@example.com') = 'viewer', 'legacy role change moves role_id';

  -- New writer: role_id only.
  update admin_users set role_id = (select id from admin_roles where key = 'fulfilment')
    where email = 'legacy-staff@example.com';
  assert (select role from admin_users where email = 'legacy-staff@example.com') = 'staff',
    'role_id change stamps the legacy name';
  delete from admin_users where email = 'legacy-staff@example.com';

  -- A system role cannot be deleted while Members hold it.
  begin
    delete from admin_roles where key = 'owner';
    assert false, 'deleting a held role must fail';
  exception when foreign_key_violation then null;
  end;
end $$;
select 'slice 03 ok';
