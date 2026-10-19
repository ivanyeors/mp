-- Appointment WhatsApp: a failed send leaves a trace, and the auto-reply to
-- messages the automated sender cannot act on is throttled per phone.
--
-- appointment_reminders.last_error / last_error_at: the cron and the booking
-- path write the provider's error to the row when a reminder send fails, and
-- clear it on the next success. Until now a failure lived only in the cron's
-- JSON response, which nothing keeps, so a row sat at `pending` with no reason
-- (live on 2026-10-19: four such rows, the oldest from July).
--
-- whatsapp_auto_replies: one row per phone, holding the last time the webhook
-- told that phone the sender is automated and pointed it at the staffed line.
-- Server-only: the service role bypasses RLS, so RLS is on with no policy and
-- the client roles hold no grant.
--
-- Idempotent.

alter table public.appointment_reminders
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

create table if not exists public.whatsapp_auto_replies (
  phone text primary key,
  sent_at timestamptz not null default now()
);

alter table public.whatsapp_auto_replies enable row level security;
revoke all on public.whatsapp_auto_replies from anon, authenticated;
