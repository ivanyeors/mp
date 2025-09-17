-- Support variant-specific bolster BOMs: short, medium, long
do $$
begin
  if not exists (select 1 from pg_type where typname = 'bolster_variant') then
    create type bolster_variant as enum ('short', 'medium', 'long');
  end if;
end $$;

alter table if exists bolster_bom_lines
  add column if not exists variant bolster_variant not null default 'medium';

-- Migrate existing rows to default variant (medium) happens automatically by NOT NULL + DEFAULT

-- Drop old unique constraint on (item_id) if present
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'bolster_bom_lines_item_id_key'
  ) then
    alter table bolster_bom_lines drop constraint bolster_bom_lines_item_id_key;
  end if;
end $$;

-- Ensure uniqueness per variant+item
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bolster_bom_lines_variant_item_key'
  ) then
    alter table bolster_bom_lines add constraint bolster_bom_lines_variant_item_key unique (variant, item_id);
  end if;
end $$;

comment on column bolster_bom_lines.variant is 'Bolster length variant';

