-- Slice 08: Telegram links under RBAC.
do $$
declare n int;
begin
  select count(*) into n from telegram_operators where staff_profile_id is null;
  assert n = 0, 'every operator has a profile';

  assert (select s.name from telegram_operators t join mp_staff s on s.id = t.staff_profile_id
          where t.telegram_user_id = 111) = 'Ivan', 'Ivan matched the existing Ivan profile';
  assert (select count(*) from mp_staff where lower(name) = 'ivan') = 1, 'no duplicate Ivan profile';
  assert (select a.email from telegram_operators t join mp_staff s on s.id = t.staff_profile_id
          join admin_users a on a.id = s.admin_user_id where t.telegram_user_id = 111) = 'sg@mpillow.com',
    'linked under sg@mpillow.com';
  assert (select actions from telegram_operators where telegram_user_id = 111)
         = array['telegram.google-review-reply', 'telegram.shop-review-moderate'], 'review manager keeps both actions';
  assert (select actions from telegram_operators where display_name = 'Nadia') = array['telegram.shop-review-moderate'],
    'shop moderator keeps moderation only';
  assert exists (select 1 from telegram_operators t join mp_staff s on s.id = t.staff_profile_id
                 where t.display_name = 'Nadia' and s.name = 'Nadia'), 'a profile was created for an unmatched operator';
  assert (select linked_at is not null from telegram_operators where telegram_user_id = 111), 'link kept';

  -- The legacy role follows actions.
  update telegram_operators set actions = '{}' where display_name = 'Nadia';
  assert (select role from telegram_operators where display_name = 'Nadia') = 'none', 'no actions → none';
  update telegram_operators set actions = array['telegram.shop-review-moderate'] where display_name = 'Nadia';
  assert (select role from telegram_operators where display_name = 'Nadia') = 'shop_moderator', 'role follows actions';

  -- A writer from before the migration: (display_name, role), no profile.
  insert into telegram_operators (display_name, role) values ('Legacy Op', 'review_manager');
  assert exists (select 1 from telegram_operators t join mp_staff s on s.id = t.staff_profile_id
                 join admin_users a on a.id = s.admin_user_id
                 where t.display_name = 'Legacy Op' and s.name = 'Legacy Op' and a.email = 'sg@mpillow.com'),
    'legacy insert gets a profile under sg@mpillow.com';
  assert (select actions from telegram_operators where display_name = 'Legacy Op')
         = array['telegram.google-review-reply', 'telegram.shop-review-moderate'], 'legacy role becomes actions';
  -- …and a legacy role change moves actions with it.
  update telegram_operators set role = 'shop_moderator' where display_name = 'Legacy Op';
  assert (select actions from telegram_operators where display_name = 'Legacy Op')
         = array['telegram.shop-review-moderate'], 'legacy role change follows into actions';
  -- A legacy insert named after a profile that already has a link gets its own.
  insert into telegram_operators (display_name, role) values ('Ivan', 'shop_moderator');
  assert (select s.name from telegram_operators t join mp_staff s on s.id = t.staff_profile_id
          where t.display_name = 'Ivan' and t.telegram_user_id is null) = 'Ivan (Telegram)', 'no two links on one profile';
  -- …and a third: the suffix counts up instead of colliding.
  insert into telegram_operators (display_name, role) values ('Ivan', 'shop_moderator');
  assert exists (select 1 from mp_staff where name = 'Ivan (Telegram 2)'), 'third same-named legacy insert';
  delete from mp_staff where name in ('Legacy Op', 'Ivan (Telegram)', 'Ivan (Telegram 2)');

  -- The legacy role is what the link can do now, so a rolled-back app (which
  -- reads only role and is_active) never allows more than the new code.
  assert (select role from telegram_operators where telegram_user_id = 111) = 'review_manager',
    'the live link keeps its access';
  update telegram_operators set actions = array['telegram.google-review-reply'] where display_name = 'Nadia';
  assert (select role from telegram_operators where display_name = 'Nadia') = 'none',
    'reply alone is not the old review_manager (which could also moderate)';

  insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000aa', 'tg-viewer@example.com');
  insert into admin_users (email, role, auth_user_id)
    values ('tg-viewer@example.com', 'viewer', '00000000-0000-4000-8000-0000000000aa');
  insert into mp_staff (name, admin_user_id) values ('Tg Viewer', (select id from admin_users where email = 'tg-viewer@example.com'));
  insert into telegram_operators (display_name, role, staff_profile_id, actions)
    values ('Tg Viewer', 'none', (select id from mp_staff where name = 'Tg Viewer'), array['telegram.shop-review-moderate']);
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'none',
    'a role without the action allows none';
  update admin_roles set permissions = permissions || array['telegram.shop-review-moderate'] where key = 'viewer';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'shop_moderator',
    'ticking it on the role re-stamps the link';
  update admin_users set is_active = false where email = 'tg-viewer@example.com';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'none', 'deactivating the login';
  update admin_users set is_active = true where email = 'tg-viewer@example.com';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'shop_moderator', 'reactivating';
  update mp_staff set archived_at = now() where name = 'Tg Viewer';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'none', 'archiving the profile';
  update mp_staff set archived_at = null where name = 'Tg Viewer';
  update admin_users set role = 'manager' where email = 'tg-viewer@example.com';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'none',
    'a legacy re-role re-stamps too (manager has no Telegram)';
  update admin_users set auth_user_id = null, role = 'viewer' where email = 'tg-viewer@example.com';
  assert (select role from telegram_operators where display_name = 'Tg Viewer') = 'none', 'an Invited login';
  delete from mp_staff where name = 'Tg Viewer';
  delete from admin_users where email = 'tg-viewer@example.com';
  update admin_roles set permissions = array['orders','returns','analytics'] where key = 'viewer';
  update telegram_operators set actions = array['telegram.shop-review-moderate'] where display_name = 'Nadia';

  -- Deleting a profile removes its link.
  delete from mp_staff where name = 'Nadia';
  assert not exists (select 1 from telegram_operators where display_name = 'Nadia'), 'link cascades with its profile';
end $$;
select 'slice 08 ok';
