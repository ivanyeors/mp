-- Saved Segments (ADR 0028 (c), PRD-customer-crm slice 05).
--
-- A Segment is a named, saved set of Customers-list filters, shared by every
-- Staff member with `customers` and counted live (CONTEXT.md). It is a query,
-- never a frozen list of people: no Customer id is stored here.
--
-- - filters holds the list's own URL parameters (`{"bought":"premium",
--   "last_order":"over:12"}`), exactly as `customerFilterParams` writes them,
--   and is read back through the list's one schema
--   (lib/crm/customer-filters.ts). A Segment and the same link therefore go
--   through one parse and one mapping, and return the same Customers.
--   Saving refuses anything the schema drops; reading parses again, and a
--   filter it no longer recognises marks the Segment *Needs review*, which
--   counts and resolves no Customers (lib/crm/segment-rules.ts).
-- - filters_version is bumped when the schema changes shape. A slice that
--   bumps it adds the upgrade from the old shape to `readSegmentFilters`;
--   until then a Segment of another version needs review.
-- - A live name is unique, case-insensitively. Archiving keeps the row (the
--   Audit Log names it) and frees the name for reuse.
--
-- Server-only: RLS on with no policy, nothing granted to anon or
-- authenticated. Never in `site_settings`, which anyone can read: a Segment's
-- filters describe Customers. The service role reads and writes it from Admin
-- Panel routes that have checked `customers` (see, count) or
-- `customers-edit` (save, update, archive).
--
-- Idempotent.

create table if not exists public.customer_segments (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 1 and 80),
  -- The list's URL parameters, as strings (customerFilterParams).
  filters               jsonb not null check (jsonb_typeof(filters) = 'object'),
  filters_version       int  not null default 1 check (filters_version >= 1),
  -- The profile the creator was working as; null when the login had several
  -- and none was chosen, or once the profile is gone.
  created_by_profile_id uuid null references public.mp_staff(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz null
);

-- Two live Segments never share a name; an archived name can be reused.
create unique index if not exists customer_segments_live_name
  on public.customer_segments (lower(name)) where archived_at is null;

drop trigger if exists trg_customer_segments_updated_at on public.customer_segments;
create trigger trg_customer_segments_updated_at
before update on public.customer_segments
for each row execute procedure public.set_updated_at();

alter table public.customer_segments enable row level security;
revoke all on public.customer_segments from anon, authenticated;

comment on table public.customer_segments is
  'Saved Segments (CRM slice 05): named Customers-list filters, shared by Staff and counted live. Server-only.';
comment on column public.customer_segments.filters is
  'The Customers list''s URL parameters (customerFilterParams), read back through customerFiltersSchema. Never Customer ids.';
comment on column public.customer_segments.filters_version is
  'The filter schema''s shape when saved. Another version needs review until readSegmentFilters upgrades it.';
