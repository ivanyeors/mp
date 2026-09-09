-- Section drafts + Publish for the landing Page Builder.
--
-- Drafts live as nullable columns on landing_sections rather than in their own table
-- or a single shared whole-page draft row. Rationale (CONTEXT.md, Flagged ambiguities):
-- per-row drafts preserve the concurrency the current per-row writes already have — a
-- shared row would make two Staff clobber each other across the whole page — and keeping
-- drafts on the same row means lib/media/replace.ts and the Used/unused scan reach them
-- by widening the selected columns rather than learning a new table.
--
-- A row with every draft_* column null has no pending change.

alter table public.landing_sections
  add column if not exists draft_content  jsonb,
  add column if not exists draft_position integer,
  add column if not exists draft_visible  boolean,
  add column if not exists draft_deleted  boolean;

comment on column public.landing_sections.draft_content is
  'Pending content override; null means no pending content change.';
comment on column public.landing_sections.draft_deleted is
  'True when this section is marked for removal by the next publish.';

-- Pending-change lookups scan for any non-null draft column.
create index if not exists idx_landing_sections_pending
  on public.landing_sections (id)
  where draft_content is not null
     or draft_position is not null
     or draft_visible is not null
     or draft_deleted is not null;

-- ---------------------------------------------------------------------
-- Publish snapshots: append-only history, read only by Restore.
-- ---------------------------------------------------------------------
create table if not exists public.landing_page_publishes (
  id           uuid primary key default gen_random_uuid(),
  sections     jsonb not null,
  published_at timestamptz not null default now(),
  published_by text
);

create index if not exists idx_landing_page_publishes_published_at
  on public.landing_page_publishes (published_at desc);

-- Every read and write goes through the service role behind the app-level
-- `page-builder` guard, matching landing_sections. RLS on with no policy is
-- deny-all for anon and authenticated, so unpublished copy is never exposed
-- through PostgREST.
alter table public.landing_page_publishes enable row level security;

-- ---------------------------------------------------------------------
-- Publish: apply every pending draft at once.
--
-- supabase-js has no transactions, so this must be one statement from the
-- client's point of view: a multi-statement publish can leave the live page
-- half-updated. Snapshot first, then apply, then clear.
-- ---------------------------------------------------------------------
create or replace function public.publish_landing_draft(actor text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  keep_limit  constant integer := 50;
begin
  -- Snapshot what is about to become live, so Restore has something to return to.
  insert into public.landing_page_publishes (sections, published_by)
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', s.slug,
          'section_type', s.section_type,
          'position', coalesce(s.draft_position, s.position),
          'visible', coalesce(s.draft_visible, s.visible),
          'content', coalesce(s.draft_content, s.content)
        )
        order by coalesce(s.draft_position, s.position)
      ),
      '[]'::jsonb
    ),
    actor
  from public.landing_sections s
  where coalesce(s.draft_deleted, false) = false
  returning id into snapshot_id;

  -- Sections marked for removal go first, so positions renumber over what remains.
  delete from public.landing_sections where draft_deleted is true;

  update public.landing_sections
  set content    = coalesce(draft_content, content),
      position   = coalesce(draft_position, position),
      visible    = coalesce(draft_visible, visible),
      updated_at = now(),
      draft_content  = null,
      draft_position = null,
      draft_visible  = null,
      draft_deleted  = null
  where draft_content is not null
     or draft_position is not null
     or draft_visible is not null
     or draft_deleted is not null;

  -- Compact positions so they stay 0..n-1 after any removals.
  with ordered as (
    select id, row_number() over (order by position, created_at) - 1 as new_position
    from public.landing_sections
  )
  update public.landing_sections s
  set position = o.new_position
  from ordered o
  where s.id = o.id and s.position is distinct from o.new_position;

  -- Bounded retention: history is a recovery tool, not an archive.
  delete from public.landing_page_publishes
  where id not in (
    select id from public.landing_page_publishes
    order by published_at desc
    limit keep_limit
  );

  return snapshot_id;
end;
$$;

revoke all on function public.publish_landing_draft(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Discard: drop every pending draft, touch nothing published.
-- ---------------------------------------------------------------------
create or replace function public.discard_landing_draft()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.landing_sections
  set draft_content  = null,
      draft_position = null,
      draft_visible  = null,
      draft_deleted  = null
  where draft_content is not null
     or draft_position is not null
     or draft_visible is not null
     or draft_deleted is not null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.discard_landing_draft() from public, anon, authenticated;
