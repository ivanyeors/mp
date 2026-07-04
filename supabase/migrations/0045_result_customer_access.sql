-- Guest magic-link + account linkage for Result status pages.

alter table mp_config_responses
  add column if not exists customer_email text,
  add column if not exists customer_id uuid,
  add column if not exists access_token uuid;

-- Backfill tokens for any rows that already have purchase-path status.
update mp_config_responses
set access_token = gen_random_uuid()
where access_token is null and status is not null;

create unique index if not exists uq_mp_config_responses_access_token
  on mp_config_responses (access_token)
  where access_token is not null;

create index if not exists idx_mp_config_responses_customer_email
  on mp_config_responses (customer_email)
  where customer_email is not null;

create index if not exists idx_mp_config_responses_customer_id
  on mp_config_responses (customer_id)
  where customer_id is not null;
