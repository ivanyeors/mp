-- Result origin Location on Result (mp_config_responses).
-- A Location is a partners-table row (ADR 0012, additive). Operator-editable,
-- separate from the auto `source` channel badge.

alter table mp_config_responses
  add column if not exists location_id uuid references partners(id);

create index if not exists idx_mp_config_responses_location_id
  on mp_config_responses (location_id)
  where location_id is not null;
