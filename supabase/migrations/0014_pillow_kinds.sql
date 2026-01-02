-- Support separate Basic vs Premium pillow products, templates, and Shopify mappings.

-- 1) Pillow products: add kind dimension (basic/premium)
alter table if exists pillow_products
  add column if not exists kind text;

update pillow_products
set kind = 'basic'
where kind is null;

alter table pillow_products
  alter column kind set default 'basic';

alter table pillow_products
  alter column kind set not null;

do $$
begin
  alter table pillow_products
    add constraint pillow_products_kind_check check (kind in ('basic','premium'));
exception
  when duplicate_object then null;
end $$;

-- Replace old uniqueness (size) with (kind,size)
alter table if exists pillow_products drop constraint if exists pillow_products_size_key;

do $$
begin
  alter table pillow_products
    add constraint pillow_products_kind_size_key unique (kind, size);
exception
  when duplicate_object then null;
end $$;

-- Seed premium pillow products (no BOM lines are created here; configure separately)
insert into pillow_products (size, kind, is_active)
select p.size, 'premium', true
from pillow_products p
where p.kind = 'basic'
on conflict (kind, size) do nothing;

-- 2) Update product_buildable view to include kind
drop view if exists product_buildable;
create view product_buildable as
select p.id as product_id,
       p.kind,
       p.size,
       min(floor(coalesce(bal.on_hand, 0) / bl.quantity))::bigint as buildable
from pillow_products p
join bom_lines bl on bl.product_id = p.id
left join inventory_balances bal on bal.item_id = bl.item_id
group by p.id, p.kind, p.size;

-- 3) BOM templates: add pillow_kind for kind='pillow'
alter table if exists bom_templates
  add column if not exists pillow_kind text;

update bom_templates
set pillow_kind = 'basic'
where kind = 'pillow' and pillow_kind is null;

do $$
begin
  alter table bom_templates
    add constraint bom_templates_kind_pillow_kind_check check (
      (kind = 'pillow' and pillow_kind in ('basic','premium'))
      or (kind = 'bolster' and pillow_kind is null)
    );
exception
  when duplicate_object then null;
end $$;

-- Replace old uniqueness; Postgres unique treats NULL as distinct so use partial indexes.
alter table if exists bom_templates drop constraint if exists bom_templates_kind_key_name_key;
create unique index if not exists uq_bom_templates_pillow on bom_templates (kind, key, pillow_kind, name) where kind = 'pillow';
create unique index if not exists uq_bom_templates_bolster on bom_templates (kind, key, name) where kind = 'bolster';
create index if not exists idx_bom_templates_kind_key_pillow_kind on bom_templates (kind, key, pillow_kind);

-- 4) Shopify variant mappings: add pillow_kind
alter table if exists shopify_variant_mappings
  add column if not exists pillow_kind text;

update shopify_variant_mappings
set pillow_kind = 'basic'
where kind = 'pillow' and pillow_kind is null;

do $$
begin
  alter table shopify_variant_mappings
    add constraint shopify_variant_mappings_pillow_kind_check check (pillow_kind in ('basic','premium') or pillow_kind is null);
exception
  when duplicate_object then null;
end $$;

alter table if exists shopify_variant_mappings drop constraint if exists shopify_variant_mappings_check;
alter table if exists shopify_variant_mappings
  add constraint shopify_variant_mappings_check check (
    (kind = 'pillow' and pillow_size is not null and pillow_kind is not null and bolster_variant is null and item_id is null)
    or (kind = 'bolster' and pillow_size is null and pillow_kind is null and bolster_variant is not null and item_id is null)
    or (kind = 'part' and pillow_size is null and pillow_kind is null and bolster_variant is null and item_id is not null)
  );

create index if not exists idx_shopify_variant_mappings_pillow_kind
  on shopify_variant_mappings (pillow_kind)
  where kind = 'pillow';

-- 5) Shopify sales queue: add pillow_kind
alter table if exists shopify_sales_queue
  add column if not exists pillow_kind text;

update shopify_sales_queue
set pillow_kind = 'basic'
where kind = 'pillow' and pillow_kind is null;

do $$
begin
  alter table shopify_sales_queue
    add constraint shopify_sales_queue_pillow_kind_check check (pillow_kind in ('basic','premium') or pillow_kind is null);
exception
  when duplicate_object then null;
end $$;

alter table if exists shopify_sales_queue drop constraint if exists shopify_sales_queue_check;
alter table if exists shopify_sales_queue
  add constraint shopify_sales_queue_check check (
    (kind = 'pillow' and pillow_size is not null and pillow_kind is not null and bolster_variant is null and item_id is null)
    or (kind = 'bolster' and pillow_size is null and pillow_kind is null and bolster_variant is not null and item_id is null)
    or (kind = 'part' and pillow_size is null and pillow_kind is null and bolster_variant is null and item_id is not null)
  );


