-- WhatsApp appointment confirm: reminder log keyed by Google Calendar event id.
-- Backend-only (service role); no Order/Customer link in v1.

create table if not exists appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id text not null,
  phone text not null,
  guest_name text not null,
  appointment_type text not null check (appointment_type in ('customisation', 'readjustment')),
  starts_at timestamptz not null,
  status text not null check (status in (
    'pending',
    'reminded',
    'confirmed',
    'offering_slots',
    'rescheduled',
    'cancelled',
    'morning_sent',
    'skipped_invalid_phone'
  )),
  offered_slots jsonb,
  day_before_wa_id text,
  morning_wa_id text,
  last_wa_id text,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_appointment_reminders_event
  on appointment_reminders(calendar_event_id);

create index if not exists idx_appointment_reminders_phone_status
  on appointment_reminders(phone, status);

create index if not exists idx_appointment_reminders_starts_at
  on appointment_reminders(starts_at);

alter table appointment_reminders enable row level security;
create policy "Service role full access appointment_reminders" on appointment_reminders
  for all using (true) with check (true);
