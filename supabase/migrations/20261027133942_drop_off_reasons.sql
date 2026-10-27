-- Drop-off reasons (PRD-crm-retention-loop slice 10; ADR 0007 amendment).
--
-- What a person tells us stopped them, asked where they leave: the storefront
-- card on the configurators and checkout, and the Result's decline step.
-- Self-reported, so kept apart from analytics_visits.drop_off_path, which
-- records only where a Visit ended (ADR 0007: a Drop-off is never a reason).
--
-- No contact details: a storefront answer carries the journey tracker's
-- Visit and Visitor ids, which are anonymous until a Visitor is merged with a
-- Customer; a decline carries its Result. `other_text` is whatever they typed,
-- read by Staff on Analytics and never sent anywhere else.
--
-- One answer per Visit per step, and one per Result per step: a second answer
-- is a unique violation, which the ingest treats as already recorded. NULLs
-- are distinct, so answers without a Visit or a Result never collide.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated.
--
-- Idempotent.

create table if not exists public.drop_off_reasons (
  id          uuid        primary key default gen_random_uuid(),
  step        text        not null check (step in ('configurator', 'checkout', 'quote_decline')),
  reason      text        not null check (reason in (
                'size_or_feel', 'try_in_person', 'price', 'delivery',
                'not_working', 'just_looking', 'changed_mind', 'other')),
  other_text  text        null check (other_text is null or char_length(other_text) between 1 and 500),
  path        text        null check (path is null or char_length(path) <= 200),
  visit_id    uuid        null,
  visitor_id  uuid        null,
  result_id   uuid        null references public.mp_config_responses (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Only a decline is about a Result (which may since have been deleted).
  check (result_id is null or step = 'quote_decline')
);

create unique index if not exists drop_off_reasons_visit_step_key
  on public.drop_off_reasons (visit_id, step);
create unique index if not exists drop_off_reasons_result_step_key
  on public.drop_off_reasons (result_id, step);
create index if not exists drop_off_reasons_created_at_idx
  on public.drop_off_reasons (created_at desc);

alter table public.drop_off_reasons enable row level security;
revoke all on public.drop_off_reasons from anon, authenticated;
