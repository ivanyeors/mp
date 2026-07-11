-- Configurator contact + Discovery source columns on Result (mp_config_responses).

alter table mp_config_responses
  add column if not exists customer_phone text,
  add column if not exists discovery_source text,
  add column if not exists discovery_source_other text;

create index if not exists idx_mp_config_responses_discovery_source
  on mp_config_responses (discovery_source)
  where discovery_source is not null;
