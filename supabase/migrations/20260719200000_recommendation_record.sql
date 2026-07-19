-- Rules Engine slice 03: Recommendation record on Result / configurator response.
-- Advice + trace only — never a filling snapshot (guest snapshot stays null).

alter table mp_config_responses
  add column if not exists recommendation_record jsonb;

comment on column mp_config_responses.recommendation_record is
  'Rules Engine recommendation record: graph version id, fired terminals, resolved outputs, evaluation trace.';
