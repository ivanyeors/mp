-- Add alteration metadata for inventory items (used for fillings).
-- Allows linking a derived/altered item back to a base item.

alter table items
  add column if not exists alteration_of_item_id bigint references items(id) on delete set null;

alter table items
  add column if not exists alteration_name text;

create index if not exists idx_items_alteration_of_item_id
  on items(alteration_of_item_id);


