-- Partners page CMS: singleton page content + partner logo entries.

create table if not exists partners_page (
  id         uuid primary key default gen_random_uuid(),
  content    jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_partners_page_updated_at on partners_page;
create trigger trg_partners_page_updated_at
before update on partners_page
for each row execute procedure set_updated_at();

create table if not exists partners (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  website_url text,
  description text,
  position    integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_partners_position on partners (position);

drop trigger if exists trg_partners_updated_at on partners;
create trigger trg_partners_updated_at
before update on partners
for each row execute procedure set_updated_at();

-- RLS: public read visible partners; partners_page is public read
alter table partners_page enable row level security;
alter table partners enable row level security;

drop policy if exists "Public read partners_page" on partners_page;
create policy "Public read partners_page" on partners_page
for select using (true);

drop policy if exists "Public read visible partners" on partners;
create policy "Public read visible partners" on partners
for select using (visible = true);

drop policy if exists "Service role full access partners_page" on partners_page;
create policy "Service role full access partners_page" on partners_page
for all using (true) with check (true);

drop policy if exists "Service role full access partners" on partners;
create policy "Service role full access partners" on partners
for all using (true) with check (true);

-- Seed singleton page content (en-US defaults from legacy copy)
insert into partners_page (content)
select jsonb_build_object(
  'en-US', jsonb_build_object(
    'title', 'Collaborate with us',
    'subtitle', 'If you think Mpillow could add value to your patients and customers, reach out for a product demo.',
    'body', E'We work with clinics, wellness centres, and retailers who share our commitment to better sleep.\n\n**What we offer**\n- Product demos and clinical education\n- Co-marketing support\n- Dedicated partner onboarding\n\n**What we look for**\n- Partners who prioritise patient outcomes\n- Willingness to recommend based on fit, not commission alone',
    'benefitCards', jsonb_build_array(
      jsonb_build_object('title', 'Clinical credibility', 'description', 'Trusted by chiropractors, physiotherapists, and sleep specialists across Singapore.'),
      jsonb_build_object('title', 'Co-marketing', 'description', 'Collaborate on content, events, and patient education.'),
      jsonb_build_object('title', 'Dedicated support', 'description', 'Product demos, fitting guidance, and ongoing partner care.')
    ),
    'ctaTitle', 'Ready to partner?',
    'ctaSubtitle', 'Reach out for a product demo and see how Mpillow can support your practice.',
    'ctaButtonLabel', 'Request a demo',
    'ctaButtonUrl', '/support',
    'showMarquee', true
  )
)
where not exists (select 1 from partners_page limit 1);

-- Seed placeholder partner logos
insert into partners (name, description, position, visible)
select * from (values
  ('Chirotherapy', 'Chiropractic & rehabilitation', 0, true),
  ('Macquarie Chiropractic', 'CBD chiropractic care', 1, true),
  ('Balance Core Physiotherapy', 'Physiotherapy & clinical pilates', 2, true),
  ('Etch & Bolts', 'Craft furniture retail', 3, true),
  ('Redefine Wellness', 'Wellness & therapy centre', 4, true)
) as v(name, description, position, visible)
where not exists (select 1 from partners limit 1);
