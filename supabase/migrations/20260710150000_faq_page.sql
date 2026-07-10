-- Page FAQ sets + items (independent of Global FAQ faq_categories / faq_items).

create table if not exists faq_page_sets (
  id           uuid primary key default gen_random_uuid(),
  surface_key  text not null,
  titles       jsonb not null default '{}',
  visible      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists idx_faq_page_sets_surface_key on faq_page_sets (surface_key);

create table if not exists faq_page_items (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references faq_page_sets (id) on delete cascade,
  slug        text not null,
  content     jsonb not null default '{}',
  position    integer not null default 0,
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists idx_faq_page_items_set_slug on faq_page_items (set_id, slug);
create index if not exists idx_faq_page_items_set_position on faq_page_items (set_id, position);

drop trigger if exists trg_faq_page_sets_updated_at on faq_page_sets;
create trigger trg_faq_page_sets_updated_at
before update on faq_page_sets
for each row execute procedure set_updated_at();

drop trigger if exists trg_faq_page_items_updated_at on faq_page_items;
create trigger trg_faq_page_items_updated_at
before update on faq_page_items
for each row execute procedure set_updated_at();

alter table faq_page_sets enable row level security;
alter table faq_page_items enable row level security;

drop policy if exists "Public read visible faq_page_sets" on faq_page_sets;
create policy "Public read visible faq_page_sets" on faq_page_sets
for select using (visible = true);

drop policy if exists "Public read visible faq_page_items" on faq_page_items;
create policy "Public read visible faq_page_items" on faq_page_items
for select using (visible = true);

drop policy if exists "Service role full access faq_page_sets" on faq_page_sets;
create policy "Service role full access faq_page_sets" on faq_page_sets
for all using (true) with check (true);

drop policy if exists "Service role full access faq_page_items" on faq_page_items;
create policy "Service role full access faq_page_items" on faq_page_items
for all using (true) with check (true);
