-- Home page: the Explore section, just below the founder's note (owner, 2026-11-18).
--
-- A built-in Landing section: its copy and its default still of the Explore scene
-- come from code (components/sections/landing/explore-section.tsx), so the row's
-- content is empty. Every section after the founder's note moves down one to make
-- room, live and draft positions alike.
--
-- Does nothing when the row already exists, or when there is no founder's note to
-- place it after. An empty table is the case that matters: the page then renders
-- the code's seed layout (lib/landing-sections.ts), which already has this section,
-- and one row here would replace that whole layout with this section alone.

do $$
declare
  founder_position integer;
begin
  if exists (select 1 from public.landing_sections where slug = 'explore') then
    return;
  end if;

  select position into founder_position
  from public.landing_sections
  where section_type = 'founder_note'
  order by position
  limit 1;

  if founder_position is null then
    return;
  end if;

  update public.landing_sections
  set position = position + 1,
      updated_at = now()
  where position > founder_position;

  update public.landing_sections
  set draft_position = draft_position + 1
  where draft_position is not null
    and draft_position > founder_position;

  insert into public.landing_sections (slug, section_type, position, visible, content)
  values ('explore', 'explore', founder_position + 1, true, '{}');
end $$;
