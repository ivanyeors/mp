-- Loyalty points: the earn rate is 1 point per S$1 (owner, 2026-11-08: "make
-- the points earned $1 spent = 1 point", for Orders and Past-purchase points
-- alike). ADR 0030, amendment of 2026-11-08: decision 3 was 3 points per S$1.
-- A point is still worth S$0.01, 100 points = S$1 (owner, the same day: "100
-- points for $1 a user can use"), so customers get 1% back.
--
-- 1. The saved rate moves from 3 to 1, and only from 3: a rate Staff saved
--    since on Settings → Discounts → Points is theirs and is left alone. A
--    missing row is seeded at 1.
-- 2. points_settings() reads a missing or malformed rate as 1, as
--    POINTS_DEFAULTS does (lib/points/settings.ts). Same signature and return
--    type, so the views that read it stand.
--
-- Points were off with no launch date when this was written, so no Order has
-- earned at 3. The rate is still a setting: Staff change it on the same page.
-- Nothing else here changes what a point is worth or what is saved in points
-- (the fewest used at once, the Claim bonus, the milestone ladder).
--
-- Server-only, as before. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The saved rate
-- ---------------------------------------------------------------------
update public.site_settings
   set value = '1', updated_at = now()
 where key = 'points_earn_per_dollar'
   and btrim(value) = '3';

insert into public.site_settings (key, value)
values ('points_earn_per_dollar', '1')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. The default
-- ---------------------------------------------------------------------
-- As 20261031032017_points_never_expire.sql, with the rate's default 1.
create or replace function public.points_settings()
returns table (
  enabled            boolean,
  launch_at          timestamptz,
  earn_per_dollar    numeric,
  min_redeem         integer,
  max_share          numeric,
  claim_bonus        integer,
  claim_bonus_months integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select key, btrim(value) as v from site_settings where key like 'points\_%')
  select
    coalesce((select lower(v) = 'true' from s where key = 'points_enabled'), false),
    (select case when v ~ '^\d{4}-\d{2}-\d{2}' then v::timestamptz end from s where key = 'points_launch_at'),
    coalesce((select case when v ~ '^\d+(\.\d+)?$' then v::numeric end from s where key = 'points_earn_per_dollar'), 1),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_min_redeem'), 500),
    coalesce((select case when v ~ '^(0(\.\d+)?|1(\.0+)?)$' then v::numeric end from s where key = 'points_max_share'), 0.5),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus'), 1000),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus_months'), 3);
$$;

revoke execute on function public.points_settings() from public, anon, authenticated;
grant execute on function public.points_settings() to service_role;
