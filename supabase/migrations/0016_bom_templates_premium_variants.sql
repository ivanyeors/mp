-- Add premium pillow variant dimension to BOM templates so we can filter templates by fabric choice.
-- Variants currently used for Premium Mpillow: linen, fibrecool.

alter table if exists bom_templates
  add column if not exists pillow_variant text;

-- Enforce allowed values when provided, and keep basic/bolster variant null.
do $$
begin
  alter table bom_templates
    add constraint bom_templates_pillow_variant_check check (
      (kind = 'pillow' and pillow_kind = 'basic' and pillow_variant is null)
      or (kind = 'pillow' and pillow_kind = 'premium' and (pillow_variant is null or pillow_variant in ('linen','fibrecool')))
      or (kind = 'bolster' and pillow_variant is null)
    );
exception
  when duplicate_object then null;
end $$;

-- Replace old uniqueness for pillow templates so the same name can exist for different variants.
drop index if exists uq_bom_templates_pillow;
create unique index if not exists uq_bom_templates_pillow_variant
  on bom_templates (kind, key, pillow_kind, coalesce(pillow_variant, ''), name)
  where kind = 'pillow';

create index if not exists idx_bom_templates_kind_key_pillow_kind_variant
  on bom_templates (kind, key, pillow_kind, pillow_variant)
  where kind = 'pillow';


