-- Every WhatsApp message the webhook accepted, keyed by Meta's message id.
-- Dedupes Meta's redeliveries, gives the guest's last-message time (what opens
-- the 24h free-text window), and is the lasting record that a message arrived
-- at all — Vercel Hobby keeps logs for an hour. Holds the parsed intent, never
-- the message text.
create table if not exists public.whatsapp_inbound (
  message_id text primary key,
  phone text not null,
  kind text not null,
  outcome text,
  received_at timestamptz not null default now()
);
create index if not exists whatsapp_inbound_phone_received_at_idx
  on public.whatsapp_inbound (phone, received_at desc);
alter table public.whatsapp_inbound enable row level security;
revoke all on public.whatsapp_inbound from anon, authenticated;

-- Google Calendar push channels (events.watch). Google POSTs to the webhook on
-- any change to the calendar; the channel id + token here are how that POST is
-- told apart from anyone else's. Renewed by the daily reminders run.
create table if not exists public.google_calendar_channels (
  id text primary key,
  resource_id text not null,
  token text not null,
  address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
alter table public.google_calendar_channels enable row level security;
revoke all on public.google_calendar_channels from anon, authenticated;
