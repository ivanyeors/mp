-- Migrate legacy filling BOM rows into Filling Templates and set defaults (ADR 0003).
-- Idempotent: skips template create when name already exists for kind+key+role=filling.

-- Pillow: seed filling templates from composed sellable filling lines.
insert into bom_templates (kind, key, name, role, is_active)
select distinct
  'pillow',
  pp.size,
  pp.size || ' - ' || pp.kind || ' - default',
  'filling',
  true
from pillow_products pp
inner join bom_lines bl on bl.product_id = pp.id
inner join items i on i.id = bl.item_id and i.category = 'filling'
where pp.is_active = true
  and not exists (
    select 1
    from bom_templates bt
    where bt.kind = 'pillow'
      and bt.key = pp.size
      and bt.name = pp.size || ' - ' || pp.kind || ' - default'
      and bt.role = 'filling'
  );

insert into bom_template_lines (template_id, item_id, quantity)
select bt.id, bl.item_id, bl.quantity
from pillow_products pp
inner join bom_lines bl on bl.product_id = pp.id
inner join items i on i.id = bl.item_id and i.category = 'filling'
inner join bom_templates bt
  on bt.kind = 'pillow'
  and bt.key = pp.size
  and bt.name = pp.size || ' - ' || pp.kind || ' - default'
  and bt.role = 'filling'
on conflict (template_id, item_id) do update set quantity = excluded.quantity;

update pillow_products pp
set default_filling_template_id = bt.id
from bom_templates bt
where pp.is_active = true
  and bt.kind = 'pillow'
  and bt.key = pp.size
  and bt.name = pp.size || ' - ' || pp.kind || ' - default'
  and bt.role = 'filling'
  and pp.default_filling_template_id is distinct from bt.id
  and exists (
    select 1
    from bom_lines bl
    inner join items i on i.id = bl.item_id and i.category = 'filling'
    where bl.product_id = pp.id
  );

-- Bolster: seed filling templates per length.
insert into bom_templates (kind, key, name, role, is_active)
select distinct
  'bolster',
  bbl.variant::text,
  bbl.variant::text || ' - default',
  'filling',
  true
from bolster_bom_lines bbl
inner join items i on i.id = bbl.item_id and i.category = 'filling'
where not exists (
  select 1
  from bom_templates bt
  where bt.kind = 'bolster'
    and bt.key = bbl.variant::text
    and bt.name = bbl.variant::text || ' - default'
    and bt.role = 'filling'
);

insert into bom_template_lines (template_id, item_id, quantity)
select bt.id, bbl.item_id, bbl.quantity
from bolster_bom_lines bbl
inner join items i on i.id = bbl.item_id and i.category = 'filling'
inner join bom_templates bt
  on bt.kind = 'bolster'
  and bt.key = bbl.variant::text
  and bt.name = bbl.variant::text || ' - default'
  and bt.role = 'filling'
on conflict (template_id, item_id) do update set quantity = excluded.quantity;

update bolster_length_config blc
set default_filling_template_id = bt.id
from bom_templates bt
where bt.kind = 'bolster'
  and bt.key = blc.variant
  and bt.name = blc.variant || ' - default'
  and bt.role = 'filling'
  and blc.default_filling_template_id is distinct from bt.id
  and exists (
    select 1
    from bolster_bom_lines bbl
    inner join items i on i.id = bbl.item_id and i.category = 'filling'
    where bbl.variant::text = blc.variant
  );

-- Purge filling rows from composed sellable BOMs.
delete from bom_lines bl
using items i
where bl.item_id = i.id
  and i.category = 'filling';

delete from bolster_bom_lines bbl
using items i
where bbl.item_id = i.id
  and i.category = 'filling';
