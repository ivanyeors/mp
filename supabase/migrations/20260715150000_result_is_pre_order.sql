-- Sticky Pre-order mode on Result (ADR 0005 / UX polish slice 06).
-- Set once at hold create; restock must not clear (slice 07 emails only).

alter table mp_config_responses
  add column if not exists is_pre_order boolean not null default false;

comment on column mp_config_responses.is_pre_order is
  'Sticky Pre-order mode captured at authorization hold create; not cleared on restock.';
