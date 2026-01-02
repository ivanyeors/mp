-- Split case/protector categories into pillow_* and bolster_*.

-- 1) Drop the old category constraint first (it only allows case/protector, not the new split categories).
do $$
begin
  alter table items drop constraint if exists items_category_check;
exception
  when undefined_object then null;
end $$;

-- 2) Normalize existing category strings (defensive)
update items
set category = lower(trim(category))
where category is not null and category <> lower(trim(category));

-- 3) Migrate existing rows
-- Heuristic:
-- - size XS/S/M/L/XL => pillow_*
-- - size Bolster/BOLSTER => bolster_*
-- - otherwise, default to pillow_*

update items
set category = 'pillow_case'
where category = 'case'
  and coalesce(upper(size), '') in ('XS','S','M','L','XL');

update items
set category = 'bolster_case'
where category = 'case'
  and coalesce(upper(size), '') = 'BOLSTER';

update items
set category = 'pillow_case'
where category = 'case';

update items
set category = 'pillow_protector'
where category = 'protector'
  and coalesce(upper(size), '') in ('XS','S','M','L','XL');

update items
set category = 'bolster_protector'
where category = 'protector'
  and coalesce(upper(size), '') = 'BOLSTER';

update items
set category = 'pillow_protector'
where category = 'protector';

-- 4) Re-add the expanded category constraint.
-- Use NOT VALID so the constraint add itself never fails; then VALIDATE after data fixes.
alter table items
  add constraint items_category_check
  check (
    category in (
      'cover',
      'pillow_case',
      'pillow_protector',
      'bolster_case',
      'bolster_protector',
      'filling',
      'packaging',
      'accessories',
      'other'
    )
  ) not valid;

alter table items validate constraint items_category_check;


