-- FAQ categories and items with localized JSONB content.

create table if not exists faq_categories (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  labels     jsonb not null default '{}',
  position   integer not null default 0,
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_faq_categories_key on faq_categories (key);
create index if not exists idx_faq_categories_position on faq_categories (position);

create table if not exists faq_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references faq_categories (id) on delete cascade,
  slug        text not null,
  content     jsonb not null default '{}',
  position    integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_faq_items_slug on faq_items (slug);
create index if not exists idx_faq_items_category_position on faq_items (category_id, position);

drop trigger if exists trg_faq_categories_updated_at on faq_categories;
create trigger trg_faq_categories_updated_at
before update on faq_categories
for each row execute procedure set_updated_at();

drop trigger if exists trg_faq_items_updated_at on faq_items;
create trigger trg_faq_items_updated_at
before update on faq_items
for each row execute procedure set_updated_at();

-- RLS: public read visible rows only
alter table faq_categories enable row level security;
alter table faq_items enable row level security;

drop policy if exists "Public read visible faq_categories" on faq_categories;
create policy "Public read visible faq_categories" on faq_categories
for select using (visible = true);

drop policy if exists "Public read visible faq_items" on faq_items;
create policy "Public read visible faq_items" on faq_items
for select using (visible = true);

drop policy if exists "Service role full access faq_categories" on faq_categories;
create policy "Service role full access faq_categories" on faq_categories
for all using (true) with check (true);

drop policy if exists "Service role full access faq_items" on faq_items;
create policy "Service role full access faq_items" on faq_items
for all using (true) with check (true);
