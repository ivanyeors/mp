-- ============================================================
-- Link mp_config_responses to orders (bi-directional sync)
-- ============================================================

-- Add order linkage columns
alter table mp_config_responses
  add column if not exists order_id uuid references orders(id) on delete set null,
  add column if not exists order_item_id uuid references order_items(id) on delete set null,
  add column if not exists source text not null default 'manual';
  -- source values: 'manual' (in-store measurement), 'online_customization' (auto-created from order)

create index if not exists idx_mp_config_responses_order_id
  on mp_config_responses(order_id);
