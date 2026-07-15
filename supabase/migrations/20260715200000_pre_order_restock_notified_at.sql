-- Idempotent Pre-order restock notice marker (ADR 0005 / UX polish slice 07).
-- Set when restock email is sent; null means not yet notified.

alter table mp_config_responses
  add column if not exists pre_order_restock_notified_at timestamptz null;

comment on column mp_config_responses.pre_order_restock_notified_at is
  'When the automated Pre-order restock email was sent; null until notified (idempotent).';
