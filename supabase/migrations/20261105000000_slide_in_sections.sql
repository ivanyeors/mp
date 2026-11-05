-- Sub pages in the Page Builder: the learn-more slide-ins opened from the landing page
-- (Size Matters, Ambassadors, Basic Mpillow, Premium Mpillow, Mbolster, Cervical Neck
-- Support). CONTEXT.md — **Slide-in section**; ADR 0046.
--
-- The sections themselves are code: each slide-in's **Product slide section config** names
-- its templates in order, and its copy lives in i18n. A row here is the Staff override
-- layer over one of those sections — order, visibility and a `content` of copy and media
-- overrides — exactly as `landing_sections` is over the landing page. A section with no
-- row renders its code default, so an empty table is today's slide-ins, unchanged, and a
-- section added in code appears without a migration.
--
-- Drafts are nullable columns on the same row, for the same reason as Landing sections:
-- per-row writes keep two Staff from clobbering each other, and the Media library's Used
-- scan reaches drafts by widening its select. Sections are never deleted from here — a
-- slide-in's sections are code-owned, so Staff hide them instead.

create table if not exists public.slide_in_sections (
  id             uuid primary key default gen_random_uuid(),
  -- The sub page, e.g. 'basic-mpillow'. Validated against the code registry by the API.
  page           text not null,
  -- The section's stable key within its page, from the code config.
  slug           text not null,
  section_type   text not null,
  position       integer not null,
  visible        boolean not null default true,
  content        jsonb not null default '{}',
  draft_content  jsonb,
  draft_position integer,
  draft_visible  boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (page, slug)
);

comment on table public.slide_in_sections is
  'Staff overrides (order, visibility, copy and media) over the code-defined sections of one landing sub page.';
comment on column public.slide_in_sections.content is
  'Published override: { copy: { <locale>: { field: value } }, media: { field: image | image[] | videoId } }.';
comment on column public.slide_in_sections.draft_content is
  'Pending content override; null means no pending content change.';

create index if not exists idx_slide_in_sections_page
  on public.slide_in_sections (page, position);

-- Every read and write goes through the service role behind the app-level `page-builder`
-- guard. RLS on with no policy is deny-all for anon and authenticated, so unpublished copy
-- is never exposed through PostgREST.
alter table public.slide_in_sections enable row level security;

-- ---------------------------------------------------------------------
-- Publish snapshots per sub page: append-only history, read only by Restore.
-- ---------------------------------------------------------------------
create table if not exists public.slide_in_page_publishes (
  id           uuid primary key default gen_random_uuid(),
  page         text not null,
  sections     jsonb not null,
  published_at timestamptz not null default now(),
  published_by text
);

create index if not exists idx_slide_in_page_publishes_page
  on public.slide_in_page_publishes (page, published_at desc);

alter table public.slide_in_page_publishes enable row level security;

-- ---------------------------------------------------------------------
-- Publish one sub page: apply its pending drafts at once, then snapshot what is live.
-- One function, because supabase-js has no transactions and a half-applied publish
-- would leave the slide-in inconsistent.
-- ---------------------------------------------------------------------
create or replace function public.publish_slide_in_draft(p_page text, actor text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  keep_limit  constant integer := 50;
begin
  update public.slide_in_sections
  set content    = coalesce(draft_content, content),
      position   = coalesce(draft_position, position),
      visible    = coalesce(draft_visible, visible),
      updated_at = now(),
      draft_content  = null,
      draft_position = null,
      draft_visible  = null
  where page = p_page
    and (draft_content is not null or draft_position is not null or draft_visible is not null);

  insert into public.slide_in_page_publishes (page, sections, published_by)
  select
    p_page,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', s.slug,
          'section_type', s.section_type,
          'position', s.position,
          'visible', s.visible,
          'content', s.content
        )
        order by s.position, s.slug
      ),
      '[]'::jsonb
    ),
    actor
  from public.slide_in_sections s
  where s.page = p_page
  returning id into snapshot_id;

  -- Bounded retention per page: history is a recovery tool, not an archive.
  delete from public.slide_in_page_publishes
  where page = p_page
    and id not in (
      select id from public.slide_in_page_publishes
      where page = p_page
      order by published_at desc
      limit keep_limit
    );

  return snapshot_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Discard one sub page's pending drafts. Published content is untouched.
-- ---------------------------------------------------------------------
create or replace function public.discard_slide_in_draft(p_page text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.slide_in_sections
  set draft_content  = null,
      draft_position = null,
      draft_visible  = null
  where page = p_page
    and (draft_content is not null or draft_position is not null or draft_visible is not null);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ---------------------------------------------------------------------
-- Restore stages a snapshot as the page's draft. It never writes published state, so
-- the recovery is reviewed in Preview mode and ships through the normal Publish.
--
-- Sections are matched on slug AND section_type: a code change that gives a key a
-- different template must not receive the old template's content shape.
-- ---------------------------------------------------------------------
create or replace function public.restore_slide_in_snapshot(snapshot_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  snap      jsonb;
  snap_page text;
  staged    integer := 0;
  reset     integer := 0;
begin
  select sections, page into snap, snap_page
  from public.slide_in_page_publishes
  where id = snapshot_id;

  if snap is null then
    raise exception 'Snapshot % not found', snapshot_id using errcode = 'no_data_found';
  end if;

  perform public.discard_slide_in_draft(snap_page);

  with entries as (
    select
      e->>'slug'                          as slug,
      e->>'section_type'                  as section_type,
      (e->>'position')::int               as position,
      (e->>'visible')::boolean            as visible,
      coalesce(e->'content', '{}'::jsonb) as content
    from jsonb_array_elements(snap) as e
  )
  -- Only what differs is staged, so the pending count names real changes.
  update public.slide_in_sections s
  set draft_content  = case when s.content  is distinct from en.content  then en.content  end,
      draft_position = case when s.position is distinct from en.position then en.position end,
      draft_visible  = case when s.visible  is distinct from en.visible  then en.visible  end,
      updated_at     = now()
  from entries en
  where s.page = snap_page
    and s.slug = en.slug
    and s.section_type = en.section_type
    and (s.content  is distinct from en.content
      or s.position is distinct from en.position
      or s.visible  is distinct from en.visible);

  get diagnostics staged = row_count;

  -- A section first overridden after this snapshot was on its code default then:
  -- restoring means clearing its override and showing it again.
  update public.slide_in_sections s
  set draft_content = case when s.content <> '{}'::jsonb then '{}'::jsonb end,
      draft_visible = case when s.visible = false then true end,
      updated_at    = now()
  where s.page = snap_page
    and (s.content <> '{}'::jsonb or s.visible = false)
    and not exists (
      select 1 from jsonb_array_elements(snap) as e where e->>'slug' = s.slug
    );

  get diagnostics reset = row_count;
  return staged + reset;
end;
$$;

revoke all on function public.publish_slide_in_draft(text, text) from public, anon, authenticated;
revoke all on function public.discard_slide_in_draft(text) from public, anon, authenticated;
revoke all on function public.restore_slide_in_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.publish_slide_in_draft(text, text) to service_role;
grant execute on function public.discard_slide_in_draft(text) to service_role;
grant execute on function public.restore_slide_in_snapshot(uuid) to service_role;
