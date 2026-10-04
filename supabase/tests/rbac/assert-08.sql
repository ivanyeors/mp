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

  -- Deleting a profile removes its link.
  delete from mp_staff where name = 'Nadia';
  assert not exists (select 1 from telegram_operators where display_name = 'Nadia'), 'link cascades with its profile';
end $$;
select 'slice 08 ok';
