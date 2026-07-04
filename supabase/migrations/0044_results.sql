-- Result model: extend mp_config_responses for authorize-then-capture purchase path.
-- payment_intent_id is nullable so in-store review-only Results need no Stripe hold.
-- proposed_* columns are schema hooks for a future LLM assigner (no model calls yet).

alter table mp_config_responses
  add column if not exists product_type text,
  add column if not exists suggested_size text,
  add column if not exists suggested_tier text,
  add column if not exists suggested_length text,
  add column if not exists assigned_size text,
  add column if not exists assigned_tier text,
  add column if not exists assigned_length text,
  add column if not exists filling_template_id bigint references bom_templates(id) on delete set null,
  add column if not exists preference_lines jsonb not null default '[]'::jsonb,
  add column if not exists addon_lines jsonb not null default '[]'::jsonb,
  add column if not exists shipping_method text,
  add column if not exists shipping_address jsonb,
  add column if not exists authorized_amount numeric(12,2),
  add column if not exists final_amount numeric(12,2),
  add column if not exists currency text not null default 'SGD',
  add column if not exists payment_intent_id text,
  add column if not exists status text,
  add column if not exists proposed_size text,
  add column if not exists proposed_tier text,
  add column if not exists proposed_length text,
  add column if not exists proposed_filling_template_id bigint references bom_templates(id) on delete set null;

alter table mp_config_responses drop constraint if exists mp_config_responses_product_type_check;
alter table mp_config_responses
  add constraint mp_config_responses_product_type_check
  check (product_type is null or product_type in ('pillow', 'bolster'));

alter table mp_config_responses drop constraint if exists mp_config_responses_suggested_tier_check;
alter table mp_config_responses
  add constraint mp_config_responses_suggested_tier_check
  check (suggested_tier is null or suggested_tier in ('basic', 'premium'));

alter table mp_config_responses drop constraint if exists mp_config_responses_assigned_tier_check;
alter table mp_config_responses
  add constraint mp_config_responses_assigned_tier_check
  check (assigned_tier is null or assigned_tier in ('basic', 'premium'));

alter table mp_config_responses drop constraint if exists mp_config_responses_proposed_tier_check;
alter table mp_config_responses
  add constraint mp_config_responses_proposed_tier_check
  check (proposed_tier is null or proposed_tier in ('basic', 'premium'));

alter table mp_config_responses drop constraint if exists mp_config_responses_status_check;
alter table mp_config_responses
  add constraint mp_config_responses_status_check
  check (
    status is null
    or status in ('held', 'assigned', 'accepted', 'declined', 'expired', 'captured')
  );

create index if not exists idx_mp_config_responses_status
  on mp_config_responses (status)
  where status is not null;

create index if not exists idx_mp_config_responses_payment_intent
  on mp_config_responses (payment_intent_id)
  where payment_intent_id is not null;
