-- Customer payment reminders for an assigned Result.
--
-- Until now the balance-due nudge borrowed `last_reminder_at` from the operator
-- SLA, so the two cadences could not be set apart and the first customer chase
-- could land a whole interval late. Give the customer side its own clock and its
-- own counter, and anchor it to the moment the build was assigned rather than to
-- submission — "three days after we told you the price" is the thing staff mean.

alter table mp_config_responses
  add column if not exists assigned_at timestamptz,
  add column if not exists payment_reminder_last_at timestamptz,
  add column if not exists payment_reminder_count integer not null default 0;

comment on column mp_config_responses.assigned_at is
  'When an operator assigned the final build. Anchors the customer payment-reminder cadence.';
comment on column mp_config_responses.payment_reminder_last_at is
  'Last balance-due reminder sent to the customer. Separate from last_reminder_at, which is the operator SLA clock.';
comment on column mp_config_responses.payment_reminder_count is
  'Balance-due reminders sent so far; capped by results_payment_reminder_max.';

-- Backfill rows already awaiting a customer decision. Prefer last_reminder_at so
-- a Result that was chased yesterday starts its new clock from that chase rather
-- than from submission — otherwise the first tick after deploy mails everyone at
-- once.
update mp_config_responses
   set assigned_at = coalesce(last_reminder_at, created_at)
 where status = 'assigned'
   and assigned_at is null;

-- The cron scans status IN ('held','assigned') and then filters on this clock.
create index if not exists mp_config_responses_payment_reminder_idx
  on mp_config_responses (status, assigned_at)
  where status = 'assigned';
