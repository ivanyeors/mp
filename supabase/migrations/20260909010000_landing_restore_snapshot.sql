-- Restore a Publish snapshot into the Section draft layer, plus a correction to
-- publish_landing_draft (shipped in 20260909000000, already applied).

-- ---------------------------------------------------------------------
-- Correction: snapshot AFTER the drafts are applied and positions compacted.
--
-- The original snapshotted `coalesce(draft_position, position)` before the delete and
-- before the row_number() compaction, so publishing a removal recorded the pre-compaction
-- numbering. Every later diff against that snapshot then reported most of the page as
-- "would change" — on the entry labelled Latest, which is byte-identical to live.
--
-- Taking the snapshot last also simplifies it: the drafts are already applied and cleared,
-- so it is a plain select of the final state.
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

  -- Snapshot exactly what is now live.
  insert into public.landing_page_publishes (sections, published_by)
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', s.slug,
          'section_type', s.section_type,
          'position', s.position,
          'visible', s.visible,
          'content', s.content
        )
        order by s.position
      ),
      '[]'::jsonb
    ),
    actor
  from public.landing_sections s
  returning id into snapshot_id;

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
grant execute on function public.publish_landing_draft(text) to service_role;
grant execute on function public.discard_landing_draft() to service_role;

-- ---------------------------------------------------------------------
-- Restore stages a snapshot as the current Section draft.
--
-- It never writes published state: Staff review the restore in Preview mode and ship it
-- through the same Publish path as any other edit. That matters because a snapshot can
-- reference a Media Asset that has since been deleted — the missing image must be visible
-- before it goes live.
--
-- Sections are matched on slug AND section_type. Slug alone is unique but not stable:
-- deleting a custom section frees its slug, so a later section can reuse it with a
-- different type, and restoring would then write the old section's content shape into it.
-- ---------------------------------------------------------------------
create or replace function public.restore_landing_snapshot(snapshot_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  snap   jsonb;
  staged integer := 0;
begin
  select sections into snap
  from public.landing_page_publishes
  where id = snapshot_id;

  if snap is null then
    raise exception 'Snapshot % not found', snapshot_id using errcode = 'no_data_found';
  end if;

  -- Restoring replaces any pending draft; the caller confirms that first.
  perform public.discard_landing_draft();

  -- Stage only sections that actually differ, so the pending count and the Publish
  -- summary describe the real change instead of listing the whole page.
  with entries as (
    select
      e->>'slug'                          as slug,
      e->>'section_type'                  as section_type,
      (e->>'position')::int               as position,
      (e->>'visible')::boolean            as visible,
      coalesce(e->'content', '{}'::jsonb) as content
    from jsonb_array_elements(snap) as e
  )
  update public.landing_sections s
  set draft_content  = en.content,
      draft_position = en.position,
      draft_visible  = en.visible,
      updated_at     = now()
  from entries en
  where s.slug = en.slug
    and s.section_type = en.section_type
    and (s.content  is distinct from en.content
      or s.position is distinct from en.position
      or s.visible  is distinct from en.visible);

  get diagnostics staged = row_count;

  -- Anything live but absent from the snapshot was added after it, so restoring means
  -- removing it again — but only sections that could have been added through the builder.
  -- A built-in introduced by a later migration must never be destroyed by restoring an
  -- older snapshot, and could not be re-created through the UI.
  update public.landing_sections s
  set draft_deleted = true,
      updated_at    = now()
  where s.section_type in (
      'custom_text_image', 'custom_full_width_image', 'custom_video',
      'custom_rich_text', 'featured_products', 'shop_cta', 'faq'
    )
    and not exists (
      select 1 from jsonb_array_elements(snap) as e where e->>'slug' = s.slug
    );

  return staged;
end;
$$;

revoke all on function public.restore_landing_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.restore_landing_snapshot(uuid) to service_role;
