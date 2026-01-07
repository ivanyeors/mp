-- Allow Shopify variant mappings (pillow/bolster) to store a default BOM template.
-- This is used to pre-fill Shopify sales queue rows with the correct template.

alter table if exists shopify_variant_mappings
  add column if not exists default_template_id bigint references bom_templates(id) on delete set null;

-- Keep the mapping shape constraints, but ensure parts cannot have a default template.
alter table if exists shopify_variant_mappings drop constraint if exists shopify_variant_mappings_check;
alter table if exists shopify_variant_mappings
  add constraint shopify_variant_mappings_check check (
    (kind = 'pillow' and pillow_size is not null and pillow_kind is not null and bolster_variant is null and item_id is null)
    or (kind = 'bolster' and pillow_size is null and pillow_kind is null and bolster_variant is not null and item_id is null)
    or (kind = 'part' and pillow_size is null and pillow_kind is null and bolster_variant is null and item_id is not null and default_template_id is null)
  );


