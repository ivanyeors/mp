-- Paired build (ADR 0026): an Mpillow Result (the anchor) and an Mbolster Result
-- (the companion) bought under one Authorization hold and accepted into one Order.
-- Both rows carry the anchor's id; an unpaired Result keeps null and is untouched.

alter table mp_config_responses
  add column if not exists paired_build_id uuid
    references mp_config_responses(id) on delete set null;

create index if not exists idx_mp_config_responses_paired_build
  on mp_config_responses (paired_build_id)
  where paired_build_id is not null;
