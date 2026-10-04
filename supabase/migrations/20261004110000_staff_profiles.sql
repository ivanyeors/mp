-- Staff profiles under logins (ADR 0023, PRD users-permissions-rbac slice 07).
--
-- Every mp_staff row (a Staff profile) now belongs to exactly one Member
-- (admin_users row). A shared studio login holds several profiles; a personal
-- login holds one. Profiles are archived, never deleted, so a Result's
-- "measured by" keeps its name; an archived profile drops out of pickers.
--
-- Backfill (PRD decision 1): every existing profile moves under
-- sg@mpillow.com, looked up by email, falling back to the oldest active Owner
-- if that login is ever missing. Then every Member without a profile gets one
-- named from their email's local part.
--
-- Live data on 2026-10-04: six profiles (Kai Lin, Ivan, Darren, Jess,
-- Wang Ying, Winnie), no name clashes, no Result references yet; Members
-- ivanyeoart@gmail.com and admin@mpillow.com get "Ivanyeoart" and "Admin".
--
-- Idempotent: safe to run more than once.

alter table mp_staff
  add column if not exists admin_user_id uuid references admin_users(id) on delete restrict,
  add column if not exists archived_at timestamptz;

update mp_staff
set admin_user_id = coalesce(
  (select id from admin_users where lower(email) = 'sg@mpillow.com'),
  (select a.id from admin_users a join admin_roles r on r.id = a.role_id
   where r.key = 'owner' and a.is_active order by a.created_at limit 1)
)
where admin_user_id is null;

-- One active name per Member; the same name may live under two Members, and an
-- archived profile frees its name.
drop index if exists idx_mp_staff_name_unique;
create unique index if not exists uq_mp_staff_member_name
  on mp_staff (admin_user_id, lower(name))
  where archived_at is null;
create index if not exists idx_mp_staff_admin_user_id on mp_staff (admin_user_id);

-- A first profile for every Member that has none, named from the email.
insert into mp_staff (name, admin_user_id)
select initcap(regexp_replace(split_part(a.email, '@', 1), '[._-]+', ' ', 'g')), a.id
from admin_users a
where not exists (select 1 from mp_staff s where s.admin_user_id = a.id);

alter table mp_staff alter column admin_user_id set not null;

-- Server-only, like admin_users: the public policies went in 20260902000000;
-- make sure no client grant lets a browser read or write profiles directly.
alter table mp_staff enable row level security;
revoke all on public.mp_staff from anon, authenticated;

comment on column mp_staff.admin_user_id is
  'The Member (login) this Staff profile works under (ADR 0023). A profile never has more access than its Member.';
comment on column mp_staff.archived_at is
  'Set when archived. Archived profiles keep their name on Results but are hidden from pickers and cannot be newly picked.';
