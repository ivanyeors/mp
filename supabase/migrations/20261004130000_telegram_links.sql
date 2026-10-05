-- Telegram under RBAC (ADR 0023, PRD users-permissions-rbac slice 08).
--
-- A telegram_operators row is now a Telegram link: it belongs to one Staff
-- profile (mp_staff) and lists the Telegram actions granted to it, as catalog
-- keys. A tap is allowed only when the profile is not archived, its Member is
-- active, the Member's role grants the action (or is grants_all) AND the link
-- lists it. Deleting a profile (only a revoked invite does) removes its link.
--
-- Backfill (PRD decision 1): each operator matches a live profile under
-- sg@mpillow.com by name, or gets one created there; review_manager → both
-- actions, shop_moderator → moderate only. sg@mpillow.com is an Owner
-- (grants_all), so nobody's effective access changes.
--
-- Expand phase: display_name and role stay (dropped in slice 11). Triggers
-- keep role at what the link can do right now (actions ∩ role, while profile
-- and Member are live), so a rolled-back app never allows more than this one;
-- 'none' is a new legal value for a link that can do nothing.
--
-- Live data on 2026-10-04: one operator, "Ivan", review_manager, active,
-- linked; it matches the existing "Ivan" profile.
--
-- Idempotent: safe to run more than once.

alter table telegram_operators
  add column if not exists staff_profile_id uuid references mp_staff(id) on delete cascade,
  add column if not exists actions text[] not null default '{}';

create unique index if not exists uq_telegram_operators_staff_profile on telegram_operators (staff_profile_id);

alter table telegram_operators drop constraint if exists telegram_operators_role_check;
alter table telegram_operators add constraint telegram_operators_role_check
  check (role in ('review_manager', 'shop_moderator', 'none'));

-- The login that links written by pre-migration code belong to (PRD decision
-- 1): sg@mpillow.com, else the oldest active Owner.
create or replace function telegram_legacy_owner()
returns uuid
language sql
set search_path = public
as $$
  select coalesce(
    (select id from admin_users where lower(email) = 'sg@mpillow.com'),
    (select a.id from admin_users a join admin_roles r on r.id = a.role_id
     where r.key = 'owner' and a.is_active order by a.created_at limit 1));
$$;

-- A profile for such a link: a live one under that login with the name and no
-- link yet, else a new one ("Ivan", then "Ivan (Telegram)", "Ivan (Telegram 2)", …).
create or replace function telegram_legacy_profile(p_name text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  owner_id uuid := telegram_legacy_owner();
  pid uuid;
  candidate text := p_name;
  n int := 1;
begin
  select s.id into pid from mp_staff s
  where s.admin_user_id = owner_id and s.archived_at is null and lower(s.name) = lower(p_name)
    and not exists (select 1 from telegram_operators t where t.staff_profile_id = s.id)
  limit 1;
  if pid is not null then
    return pid;
  end if;
  while exists (select 1 from mp_staff s where s.admin_user_id = owner_id and s.archived_at is null
                and lower(s.name) = lower(candidate)) loop
    n := n + 1;
    candidate := p_name || case when n = 2 then ' (Telegram)' else ' (Telegram ' || (n - 1) || ')' end;
  end loop;
  insert into mp_staff (name, admin_user_id) values (candidate, owner_id) returning id into pid;
  return pid;
end;
$$;

do $$
declare
  op record;
begin
  for op in select * from telegram_operators where staff_profile_id is null order by created_at loop
    update telegram_operators
    set staff_profile_id = telegram_legacy_profile(op.display_name),
        actions = case op.role
          when 'review_manager' then array['telegram.google-review-reply', 'telegram.shop-review-moderate']
          when 'shop_moderator' then array['telegram.shop-review-moderate']
          else '{}'::text[] end
    where id = op.id;
  end loop;
end $$;

alter table telegram_operators alter column staff_profile_id set not null;

-- What a rolled-back app may let this link do, as the old role name: the
-- link's actions the role also grants, and none unless the profile is live and
-- its Member active and signed in (lib/telegram/operators.ts makes the same
-- call). Old review_manager meant both actions, so reply alone maps to none.
create or replace function telegram_legacy_role(p_profile uuid, p_actions text[])
returns text
language sql
set search_path = public
as $$
  select case
    when eff @> array['telegram.google-review-reply', 'telegram.shop-review-moderate'] then 'review_manager'
    when eff @> array['telegram.shop-review-moderate'] then 'shop_moderator'
    else 'none' end
  from (
    select coalesce((
      select case when r.grants_all then p_actions
                  else array(select unnest(p_actions) intersect select unnest(r.permissions)) end
      from mp_staff s
      join admin_users a on a.id = s.admin_user_id
      join admin_roles r on r.id = a.role_id
      where s.id = p_profile and s.archived_at is null and a.is_active and a.auth_user_id is not null
    ), '{}'::text[]) as eff
  ) x;
$$;

-- Expand phase (slice 11 removes this): role and actions describe the same
-- access, so keep them in step whichever one a writer sets.
--  * App code from before this migration inserts (display_name, role) with no
--    profile: give the row a profile under sg@mpillow.com, as the backfill did,
--    and actions from the role. It changes access by updating role: follow it.
--  * Either way, stamp role with what the link can do right now, so a
--    rolled-back app (which reads only role and is_active) never allows more.
create or replace function telegram_operators_sync_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.staff_profile_id is null then
    new.staff_profile_id := telegram_legacy_profile(new.display_name);
  end if;

  if (tg_op = 'INSERT' and coalesce(array_length(new.actions, 1), 0) = 0
        and new.role in ('review_manager', 'shop_moderator'))
     or (tg_op = 'UPDATE' and new.role is distinct from old.role and new.actions is not distinct from old.actions) then
    new.actions := case new.role
      when 'review_manager' then array['telegram.google-review-reply', 'telegram.shop-review-moderate']
      when 'shop_moderator' then array['telegram.shop-review-moderate']
      else '{}'::text[] end;
  end if;

  new.role := telegram_legacy_role(new.staff_profile_id, new.actions);
  return new;
end;
$$;

drop trigger if exists trg_telegram_operators_sync_role on telegram_operators;
create trigger trg_telegram_operators_sync_role
before insert or update of role, actions on telegram_operators
for each row execute procedure telegram_operators_sync_role();

-- …and re-stamp it when what the link can do changes elsewhere: the profile is
-- archived or moved, the Member deactivated or re-roled, or the role edited.
-- (Touching actions fires the trigger above.)
create or replace function telegram_operators_resync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'mp_staff' then
    update telegram_operators set actions = actions where staff_profile_id = new.id;
  elsif tg_table_name = 'admin_users' then
    update telegram_operators t set actions = t.actions
    from mp_staff s where s.id = t.staff_profile_id and s.admin_user_id = new.id;
  elsif tg_table_name = 'admin_roles' then
    update telegram_operators t set actions = t.actions
    from mp_staff s join admin_users a on a.id = s.admin_user_id
    where s.id = t.staff_profile_id and a.role_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_mp_staff_telegram_resync on mp_staff;
create trigger trg_mp_staff_telegram_resync
after update on mp_staff
for each row
when (old.archived_at is distinct from new.archived_at or old.admin_user_id is distinct from new.admin_user_id)
execute procedure telegram_operators_resync();

drop trigger if exists trg_admin_users_telegram_resync on admin_users;
create trigger trg_admin_users_telegram_resync
after update on admin_users
for each row
when (old.is_active is distinct from new.is_active or old.role_id is distinct from new.role_id
      or old.auth_user_id is distinct from new.auth_user_id)
execute procedure telegram_operators_resync();

drop trigger if exists trg_admin_roles_telegram_resync on admin_roles;
create trigger trg_admin_roles_telegram_resync
after update on admin_roles
for each row
when (old.permissions is distinct from new.permissions or old.grants_all is distinct from new.grants_all)
execute procedure telegram_operators_resync();

-- Re-stamp every existing row with the rule above.
update telegram_operators set actions = actions;

comment on table telegram_operators is
  'Telegram links (ADR 0023): a Staff profile''s bound Telegram user id and granted actions. Effective access = Member role permissions ∩ actions, while profile and Member are active.';
comment on column telegram_operators.actions is 'Granted Telegram actions as permission catalog keys (telegram.*).';
comment on column telegram_operators.role is 'Legacy (expand phase): what the link can do right now as an old role name, kept by trg_telegram_operators_sync_role and the resync triggers. Dropped in slice 11.';
comment on column telegram_operators.display_name is 'Legacy (expand phase): the profile name when linked. Read mp_staff.name instead. Dropped in slice 11.';
