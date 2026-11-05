-- The pillow a Staff member linked to a Customer (ADR 0042 j).
--
-- The Customer page draws the Customer's pillow in the x-ray. With no row here
-- it is read from their latest Fitting record: the size the form recorded and
-- the Filling Template its configuration type names (`T12` → `Type-12`),
-- worked out on every read (lib/customer-pillow/match.ts) and never stored.
-- A row here is Staff saying otherwise: this size, this template. Deleting the
-- row goes back to the fitting's.
--
-- One per Customer. It describes the pillow they have, not a build: it is not
-- a Result, never reaches the money path, stock or analytics, and the
-- template is drawn as it is now (a Result keeps its own snapshot).
--
-- Staff-only, as customer_fittings: RLS on with no policy, and no grant to the
-- client roles, because the customer can read their own `customers` row and
-- this is ours. The service role bypasses RLS.
--
-- A Customer an import created and a Staff member then linked a pillow to is
-- referenced, so the imports' Undo keeps them: both read every foreign key to
-- `customers` from the catalog.
--
-- Idempotent.

create table if not exists public.customer_pillows (
  customer_id           uuid primary key references public.customers(id) on delete cascade,
  pillow_size           text not null check (pillow_size in ('XS', 'S', 'M', 'L', 'XL')),
  -- Null: the size is known and the filling is not. A deleted template leaves the size.
  filling_template_id   bigint null references public.bom_templates(id) on delete set null,
  -- The login that linked it, and the Staff profile it was working as.
  linked_by_user_id     uuid null references auth.users(id) on delete set null,
  linked_by_profile_id  uuid null references public.mp_staff(id) on delete set null,
  linked_at             timestamptz not null default now()
);

create index if not exists customer_pillows_template_idx
  on public.customer_pillows (filling_template_id)
  where filling_template_id is not null;

alter table public.customer_pillows enable row level security;
revoke all on public.customer_pillows from anon, authenticated;
