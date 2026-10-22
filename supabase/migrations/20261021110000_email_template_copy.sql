-- Editable email copy (PRD-email-templates).
--
-- email_template_copy: the words Staff changed in one email, on Admin Panel →
-- Email templates. One row per email (`template_id`, the EmailCopySpec id in
-- lib/email); no row means the email sends its default wording. `copy` holds
-- every field of the email as Staff saved it, {field: text}.
--
-- The code decides what is valid, not this table: lib/email/copy.ts
-- validates on save, and again when a send reads the row
-- (`resolveEmailCopy`), so a field whose saved text no longer fits the email
-- (a placeholder the email dropped) falls back to its default alone, and an
-- edit can never stop an email from being sent. Resetting an email deletes
-- its row. Every save and reset is in admin_audit_log with the words before
-- and after.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated.
-- The Admin Panel writes it with the service role after checking the
-- `email-templates` permission; every send path reads it with the service
-- role.
--
-- Idempotent.

create table if not exists public.email_template_copy (
  template_id           text primary key check (template_id ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  copy                  jsonb not null check (jsonb_typeof(copy) = 'object'),
  updated_at            timestamptz not null default now(),
  updated_by_profile_id uuid null references public.mp_staff(id) on delete set null
);

alter table public.email_template_copy enable row level security;
revoke all on public.email_template_copy from anon, authenticated;

drop trigger if exists trg_email_template_copy_updated_at on public.email_template_copy;
create trigger trg_email_template_copy_updated_at
before update on public.email_template_copy
for each row execute procedure public.set_updated_at();
