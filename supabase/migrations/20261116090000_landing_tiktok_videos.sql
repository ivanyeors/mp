-- Page builder: TikTok videos is an addable custom section.
--
-- Restoring a Publish snapshot removes custom sections added after it. The list of
-- builder-addable types is spelled out in the function (a built-in added by a later
-- migration must never be removed by a restore), so the new type joins it here.
-- Additive: until this runs, restoring an older snapshot simply leaves a TikTok
-- videos section in place.

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
      'custom_rich_text', 'featured_products', 'shop_cta', 'faq',
      'delivery_estimator', 'tiktok_videos'
    )
    and not exists (
      select 1 from jsonb_array_elements(snap) as e where e->>'slug' = s.slug
    );

  return staged;
end;
$$;

revoke all on function public.restore_landing_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.restore_landing_snapshot(uuid) to service_role;
