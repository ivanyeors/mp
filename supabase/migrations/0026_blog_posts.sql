-- Blog posts with localized content (JSONB), status lifecycle, and SEO fields.

create table if not exists blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  status        text not null default 'draft'
                check (status in ('draft','published','unpublished')),

  -- Localized content stored as JSONB: { "en-US": { title, sub_header, description, body, seo_keywords }, "zh-CN": { ... } }
  content       jsonb not null default '{}',

  -- Shared (non-localized) fields
  image_url     text,
  author        text not null default 'Mpillow',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create unique index if not exists idx_blog_posts_slug on blog_posts (slug);
create index if not exists idx_blog_posts_status on blog_posts (status);
create index if not exists idx_blog_posts_published_at on blog_posts (published_at desc nulls last);

-- Auto-update updated_at
drop trigger if exists trg_blog_posts_updated_at on blog_posts;
create trigger trg_blog_posts_updated_at
before update on blog_posts
for each row execute procedure set_updated_at();

-- RLS
alter table blog_posts enable row level security;

drop policy if exists "Public read published blog_posts" on blog_posts;
create policy "Public read published blog_posts" on blog_posts
for select using (status = 'published');

drop policy if exists "Service role full access blog_posts" on blog_posts;
create policy "Service role full access blog_posts" on blog_posts
for all using (true) with check (true);
