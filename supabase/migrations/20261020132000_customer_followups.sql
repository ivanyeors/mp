-- Follow-ups assigned to Staff profiles (ADR 0027 (e), PRD-customer-crm slice 06).
--
-- A Follow-up is a dated to-do about one Customer, assigned to a Staff profile
-- (mp_staff), and done or not done. Never to a Member or a login: on a shared
-- login the person at the device works as a profile, and "Working as" decides
-- whose *Mine* list and sidebar badge they see. That is attribution, never
-- authorisation: every Staff member with `customers` sees every follow-up, and
-- creating, completing, reassigning and deleting need `customers-edit`.
--
-- Facts, not statuses (ADR 0028 k): *open* is `done_at is null`, *overdue* is
-- an open one whose `due_on` is before today in Singapore. Neither is stored,
-- so neither can drift.
--
-- - due_on is a Singapore calendar date. "Today" is computed by the server in
--   Asia/Singapore (lib/crm/followup-rules.ts), never by the database's zone.
-- - assigned_to_profile_id has no ON DELETE: profiles are archived, never
--   deleted (20261004110000_staff_profiles.sql), and an archived assignee
--   keeps its open follow-ups until Staff reassign them.
-- - Deleting a follow-up removes the row; the Audit Log keeps its ids.
--
-- Server-only: RLS on with no policy, nothing granted to anon or authenticated.
-- The service role reads and writes it from Admin Panel routes that have
-- checked the caller.
--
-- Idempotent.

create table if not exists public.customer_followups (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.customers(id) on delete cascade,
  title                  text not null check (length(btrim(title)) between 1 and 200),
  -- A Singapore calendar date.
  due_on                 date not null,
  assigned_to_profile_id uuid not null references public.mp_staff(id),
  -- The profile the creator was working as; null when the login had several
  -- and none was chosen, or once the profile is gone.
  created_by_profile_id  uuid null references public.mp_staff(id) on delete set null,
  created_at             timestamptz not null default now(),
  done_at                timestamptz null,
  done_by_profile_id     uuid null references public.mp_staff(id) on delete set null,
  -- Who completed it only once it is done.
  constraint customer_followups_done_by_when_done check (done_at is not null or done_by_profile_id is null)
);

-- *Mine* and the sidebar badge: a profile's open follow-ups by due date.
create index if not exists idx_customer_followups_open_assignee_due
  on public.customer_followups (assigned_to_profile_id, due_on)
  where done_at is null;

-- The Customer detail card and the timeline.
create index if not exists idx_customer_followups_customer_created
  on public.customer_followups (customer_id, created_at desc);

alter table public.customer_followups enable row level security;
revoke all on public.customer_followups from anon, authenticated;

comment on table public.customer_followups is
  'Follow-ups (CRM slice 06): a dated to-do about one Customer, assigned to a Staff profile. Server-only.';
comment on column public.customer_followups.due_on is
  'A Singapore calendar date. Overdue = open (done_at is null) and due_on before today in Asia/Singapore.';
comment on column public.customer_followups.assigned_to_profile_id is
  'A Staff profile (mp_staff), never a Member or a login. An archived assignee keeps its open follow-ups until reassigned.';
