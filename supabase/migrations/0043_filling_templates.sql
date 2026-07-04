-- Filling Templates: filling-only BOM templates, size-scoped, operator-selectable.
-- Warehouse named templates (role = 'warehouse') stay unchanged for Apply-to-active-BOM.

alter table bom_templates
  add column if not exists role text not null default 'warehouse',
  add column if not exists is_active boolean not null default true;

alter table bom_templates drop constraint if exists bom_templates_role_check;
alter table bom_templates
  add constraint bom_templates_role_check check (role in ('warehouse', 'filling'));

-- Scope existing uniques to warehouse so filling templates can share names.
drop index if exists uq_bom_templates_pillow_variant;
create unique index if not exists uq_bom_templates_pillow_warehouse
  on bom_templates (kind, key, pillow_kind, coalesce(pillow_variant, ''), name)
  where role = 'warehouse' and kind = 'pillow';

drop index if exists uq_bom_templates_bolster;
create unique index if not exists uq_bom_templates_bolster_warehouse
  on bom_templates (kind, key, name)
  where role = 'warehouse' and kind = 'bolster';

-- Filling templates are scoped by product type + size key only (no tier / pillow_kind).
create unique index if not exists uq_bom_templates_filling
  on bom_templates (kind, key, name)
  where role = 'filling';

create index if not exists idx_bom_templates_filling_list
  on bom_templates (kind, key, is_active)
  where role = 'filling';
