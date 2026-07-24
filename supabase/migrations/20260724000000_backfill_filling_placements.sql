-- Backfill spatial placements for legacy Filling Templates (ADR 0008).
--
-- The legacy seed (20260705130000) populated each Filling Template's flat
-- bom_template_lines but never wrote placement rows, so the Staff x-ray editor
-- (/api/mp-config/assist?templateId=) renders empty for every legacy template.
-- Pack list / COGS / assign still work because derivePackList() falls back to
-- flat lines, but the editor has no "where" to show.
--
-- Materialize placements from the flat lines using a deterministic
-- fill-cells-in-order spread. Idempotent (skips templates that already have
-- placements — Staff-authored or a re-run) and self-verifying (asserts no piece
-- is lost). Flat bom_template_lines stay in place as the fallback.

-- Templates needing backfill: role=filling with zero placement rows today.
drop table if exists _fill_backfill;
create temporary table _fill_backfill as
select bt.id as template_id, bt.kind
from bom_templates bt
where bt.role = 'filling'
  and bt.kind in ('pillow', 'bolster')
  and (
    (bt.kind = 'pillow'  and not exists (select 1 from filling_template_placements p where p.template_id = bt.id)) or
    (bt.kind = 'bolster' and not exists (select 1 from bolster_template_placements p where p.template_id = bt.id))
  );

-- 1. Overflow guard: a pillow holds at most 9 cells x 5 slots = 45 pieces.
--    Fail loud rather than silently drop pieces (once placements exist,
--    derivePackList ignores the flat lines, so a dropped piece is lost COGS).
do $$
declare bad record;
begin
  for bad in
    select f.template_id, sum(bl.quantity)::int as total
    from _fill_backfill f
    join bom_template_lines bl on bl.template_id = f.template_id
    where f.kind = 'pillow'
    group by f.template_id
    having sum(bl.quantity) > 45
  loop
    raise exception
      'Filling template % has % pieces, exceeding the 45 (9x5) cell capacity; resolve before backfilling placements',
      bad.template_id, bad.total;
  end loop;
end $$;

-- 2. Pillow: fill cells left->center->right, front->middle->back, up to 5 per
--    cell. idx is a stable 0-based piece index; cell = idx/5, slot = idx%5+1.
--    Section/sub-section order matches SECTIONS/SUB_SECTIONS in
--    lib/spatial-fillings/core.ts. row_index left null = auto side-by-side.
insert into filling_template_placements (template_id, section, sub_section, slot, item_id)
select
  e.template_id,
  (array['left','center','right'])[(e.idx / 5) / 3 + 1],
  (array['front','middle','back'])[(e.idx / 5) % 3 + 1],
  (e.idx % 5) + 1,
  e.item_id
from (
  select
    f.template_id,
    bl.item_id,
    (row_number() over (partition by f.template_id order by bl.item_id, gs) - 1)::int as idx
  from _fill_backfill f
  join bom_template_lines bl on bl.template_id = f.template_id
  cross join lateral generate_series(1, bl.quantity::int) as gs
  where f.kind = 'pillow'
) e;

-- 3. Bolster: single compartment, slots 1..N, no cap in v1.
insert into bolster_template_placements (template_id, slot, item_id)
select
  e.template_id,
  e.slot,
  e.item_id
from (
  select
    f.template_id,
    bl.item_id,
    (row_number() over (partition by f.template_id order by bl.item_id, gs))::int as slot
  from _fill_backfill f
  join bom_template_lines bl on bl.template_id = f.template_id
  cross join lateral generate_series(1, bl.quantity::int) as gs
  where f.kind = 'bolster'
) e;

-- 4. Self-verify: for each backfilled template, per-item placement count must
--    equal the flat-line quantity (no piece lost; pack list unchanged). Scoped
--    to _fill_backfill only, so pre-existing Staff-authored placements that
--    legitimately diverge from stale flat lines are never checked.
do $$
declare m record;
begin
  for m in
    select bl.template_id, bl.item_id, bl.quantity::int as flat_qty, count(p.item_id) as placed
    from _fill_backfill f
    join bom_template_lines bl on bl.template_id = f.template_id
    left join filling_template_placements p
      on p.template_id = bl.template_id and p.item_id = bl.item_id
    where f.kind = 'pillow'
    group by bl.template_id, bl.item_id, bl.quantity
    having bl.quantity::int <> count(p.item_id)
  loop
    raise exception 'Pillow backfill mismatch: template % item % flat=% placed=%',
      m.template_id, m.item_id, m.flat_qty, m.placed;
  end loop;

  for m in
    select bl.template_id, bl.item_id, bl.quantity::int as flat_qty, count(p.item_id) as placed
    from _fill_backfill f
    join bom_template_lines bl on bl.template_id = f.template_id
    left join bolster_template_placements p
      on p.template_id = bl.template_id and p.item_id = bl.item_id
    where f.kind = 'bolster'
    group by bl.template_id, bl.item_id, bl.quantity
    having bl.quantity::int <> count(p.item_id)
  loop
    raise exception 'Bolster backfill mismatch: template % item % flat=% placed=%',
      m.template_id, m.item_id, m.flat_qty, m.placed;
  end loop;
end $$;

drop table if exists _fill_backfill;
