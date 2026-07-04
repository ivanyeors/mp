-- SLA reminders / auto-expiry for unassigned held Results (slice 08).
alter table mp_config_responses
  add column if not exists last_reminder_at timestamptz;

create index if not exists idx_mp_config_responses_held_queue
  on mp_config_responses (created_at)
  where status = 'held';
