-- Loyalty points: the earn rate is 5 points per S$1 (owner, 2026-11-08: "can
-- we change to 5 points per $1 spent?", for Orders and Past-purchase points
-- alike). ADR 0030, amendment of 2026-11-08: decision 3 was 3 points per S$1.
--
-- 1. The saved rate moves from 3 to 5, and only from 3: a rate Staff saved
--    since on Settings → Discounts → Points is theirs and is left alone. A
--    missing row is seeded at 5.
-- 2. points_settings() reads a missing or malformed rate as 5, as
--    POINTS_DEFAULTS does (lib/points/settings.ts). Same signature and return
--    type, so the views that read it stand.
--
-- Points were off with no launch date when this was written, so no Order has
-- earned at 3. The rate is still a setting: Staff change it on the same page.
--
-- Server-only, as before. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The saved rate
-- ---------------------------------------------------------------------
update public.site_settings
   set value = '5', updated_at = now()
 where key = 'points_earn_per_dollar'
   and btrim(value) = '3';

insert into public.site_settings (key, value)
values ('points_earn_per_dollar', '5')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. The default
-- ---------------------------------------------------------------------
-- As 20261031032017_points_never_expire.sql, with the rate's default 5.
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
    coalesce((select case when v ~ '^\d+(\.\d+)?$' then v::numeric end from s where key = 'points_earn_per_dollar'), 5),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_min_redeem'), 500),
    coalesce((select case when v ~ '^(0(\.\d+)?|1(\.0+)?)$' then v::numeric end from s where key = 'points_max_share'), 0.5),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus'), 1000),
    coalesce((select case when v ~ '^\d+$' then v::integer end from s where key = 'points_claim_bonus_months'), 3);
$$;

revoke execute on function public.points_settings() from public, anon, authenticated;
grant execute on function public.points_settings() to service_role;
