-- SEO annotations: dated markers on the visibility charts (PRD-search-visibility,
-- slice 05). "What shipped when", so a change in a trend line can be attributed.
-- Admin-written through server actions (service role); no client access.

create table if not exists seo_annotations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  label text not null check (char_length(label) between 1 and 120),
  category text not null default 'seo'
    check (category in ('seo', 'content', 'site', 'earned', 'tracking', 'other')),
  url text check (url is null or url ~ '^https?://'),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_seo_annotations_date on seo_annotations (date);

alter table seo_annotations enable row level security;
revoke all on public.seo_annotations from anon, authenticated;

-- What already shipped (merge dates from git history; PRD-seo-aeo-geo).
insert into seo_annotations (date, label, category, created_by) values
  ('2026-07-10', 'Domain moved to custom.mpillow.com (301 from work.)', 'site', 'seed'),
  ('2026-07-10', 'SEO foundations: JSON-LD, curated llms.txt, configurator SEO shells, guides', 'seo', 'seed'),
  ('2026-07-15', 'First-party visit tracking starts', 'tracking', 'seed');
