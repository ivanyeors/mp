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
-- Expand phase: display_name and role stay (dropped in slice 11). role is kept
-- in step with actions by a trigger so an app rollback reads the same access;
-- 'none' is a new legal value for a link with no actions.
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

do $$
declare
  owner_id uuid;
  op record;
  pid uuid;
begin
  select id into owner_id from admin_users where lower(email) = 'sg@mpillow.com';
  if owner_id is null then
    select a.id into owner_id from admin_users a join admin_roles r on r.id = a.role_id
    where r.key = 'owner' and a.is_active order by a.created_at limit 1;
  end if;

  for op in select * from telegram_operators where staff_profile_id is null order by created_at loop
    pid := null;
    select s.id into pid from mp_staff s
    where s.admin_user_id = owner_id and s.archived_at is null and lower(s.name) = lower(op.display_name)
      and not exists (select 1 from telegram_operators t where t.staff_profile_id = s.id)
    limit 1;
    if pid is null then
      -- No free profile by that name: create one (suffixed if the name is taken).
      insert into mp_staff (name, admin_user_id)
      values (
        case when exists (select 1 from mp_staff s where s.admin_user_id = owner_id and s.archived_at is null
                          and lower(s.name) = lower(op.display_name))
             then op.display_name || ' (Telegram)' else op.display_name end,
        owner_id)
      returning id into pid;
    end if;
    update telegram_operators
    set staff_profile_id = pid,
        actions = case op.role
          when 'review_manager' then array['telegram.google-review-reply', 'telegram.shop-review-moderate']
          when 'shop_moderator' then array['telegram.shop-review-moderate']
          else '{}'::text[] end
    where id = op.id;
  end loop;
end $$;

alter table telegram_operators alter column staff_profile_id set not null;

-- Legacy role mirrors actions while both exist (slice 11 drops role).
create or replace function telegram_operators_sync_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.role := case
    when 'telegram.google-review-reply' = any(new.actions) then 'review_manager'
    when 'telegram.shop-review-moderate' = any(new.actions) then 'shop_moderator'
    else 'none' end;
  return new;
end;
$$;

drop trigger if exists trg_telegram_operators_sync_role on telegram_operators;
create trigger trg_telegram_operators_sync_role
before insert or update of actions on telegram_operators
for each row execute procedure telegram_operators_sync_role();

comment on table telegram_operators is
  'Telegram links (ADR 0023): a Staff profile''s bound Telegram user id and granted actions. Effective access = Member role permissions ∩ actions, while profile and Member are active.';
comment on column telegram_operators.actions is 'Granted Telegram actions as permission catalog keys (telegram.*).';
comment on column telegram_operators.role is 'Legacy (expand phase): mirrors actions via trg_telegram_operators_sync_role. Dropped in slice 11.';
comment on column telegram_operators.display_name is 'Legacy (expand phase): the profile name when linked. Read mp_staff.name instead. Dropped in slice 11.';
