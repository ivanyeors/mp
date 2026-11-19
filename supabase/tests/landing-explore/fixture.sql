-- Stand-in for public.landing_sections (0027_landing_sections.sql plus the
-- draft columns of 20260909000000_landing_section_drafts.sql), holding the live
-- layout of 18 Nov 2026: the founder's note at 11, then the page FAQ at 12.
-- The page FAQ also has a draft move pending, to 13.
create table public.landing_sections (
  id             uuid primary key default gen_random_uuid(),
  section_type   text not null,
  slug           text not null unique,
  position       integer not null,
  visible        boolean not null default true,
  content        jsonb not null default '{}',
  draft_content  jsonb,
  draft_position integer,
  draft_visible  boolean,
  draft_deleted  boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

insert into public.landing_sections (slug, section_type, position) values
  ('hero', 'hero', 0), ('size-matters', 'text_image', 1), ('marquee', 'marquee', 2),
  ('ambassadors', 'text_image', 3), ('stories', 'stories', 4),
  ('pick-your-mpillow', 'pick_your_mpillow', 5), ('neck-pains', 'neck_pains', 6),
  ('why-choose', 'why_choose_highlights', 7), ('mbolster', 'product_card', 8),
  ('credibility', 'credibility', 9), ('review', 'video_embed', 10),
  ('founder', 'founder_note', 11), ('home-page-faq', 'faq', 12);
update public.landing_sections set draft_position = 13 where slug = 'home-page-faq';
update public.landing_sections set draft_position = 3 where slug = 'stories';

-- Two more tables for the cases where the migration must do nothing: no rows
-- at all (the page renders the code's seed layout), and no founder's note.
create schema empty_case;
create table empty_case.landing_sections (like public.landing_sections including all);
create schema no_founder_case;
create table no_founder_case.landing_sections (like public.landing_sections including all);
insert into no_founder_case.landing_sections (slug, section_type, position) values ('hero', 'hero', 0);
