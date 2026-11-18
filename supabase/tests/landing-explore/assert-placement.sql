-- After 20261118120000_landing_explore_section.sql, run twice.
do $$
declare
  got text;
begin
  select string_agg(slug || '@' || position, ' ' order by position) into got
  from public.landing_sections where position >= 10;
  if got is distinct from 'review@10 founder@11 explore@12 home-page-faq@13' then
    raise exception 'Explore is not just below the founder''s note: %', got;
  end if;

  if (select count(*) from public.landing_sections where slug = 'explore') <> 1 then
    raise exception 'Explore was inserted more than once';
  end if;

  if (select section_type || ' ' || visible || ' ' || content::text from public.landing_sections where slug = 'explore')
     is distinct from 'explore true {}' then
    raise exception 'Explore row is not a visible built-in with empty content';
  end if;

  if (select count(distinct position) from public.landing_sections) <> (select count(*) from public.landing_sections) then
    raise exception 'Two sections share a position';
  end if;

  -- A pending draft move after the founder's note moves down too; one before it stays.
  if (select draft_position from public.landing_sections where slug = 'home-page-faq') <> 14 then
    raise exception 'The FAQ''s draft position did not move down one';
  end if;
  if (select draft_position from public.landing_sections where slug = 'stories') <> 3 then
    raise exception 'A draft position before the founder''s note moved';
  end if;
end $$;
select 'placement ok';
