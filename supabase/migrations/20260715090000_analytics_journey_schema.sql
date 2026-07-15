-- First-party journey analytics (ADR 0007). Service-role ingest/read only.

create table if not exists analytics_visitors (
  id uuid primary key,
  ga_client_id text,
  customer_id uuid,
  email text,
  created_at timestamptz not null default now(),
  merged_at timestamptz
);

create index if not exists idx_analytics_visitors_ga_client_id
  on analytics_visitors (ga_client_id)
  where ga_client_id is not null;

create table if not exists analytics_visits (
  id uuid primary key,
  visitor_id uuid not null references analytics_visitors (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  entry_source text,
  entry_medium text,
  entry_campaign text,
  referrer_host text,
  country text,
  drop_off_path text,
  drop_off_section text,
  converted_order_id uuid
);

create index if not exists idx_analytics_visits_visitor_id
  on analytics_visits (visitor_id);
create index if not exists idx_analytics_visits_started_at
  on analytics_visits (started_at);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references analytics_visits (id) on delete cascade,
  visitor_id uuid not null references analytics_visitors (id),
  type text not null check (type in ('page_view', 'section_view', 'heartbeat')),
  path text not null,
  section_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_visit_occurred
  on analytics_events (visit_id, occurred_at);
create index if not exists idx_analytics_events_type_occurred
  on analytics_events (type, occurred_at);

alter table analytics_visitors enable row level security;
alter table analytics_visits enable row level security;
alter table analytics_events enable row level security;

create policy "Service role full access analytics_visitors"
  on analytics_visitors for all using (true) with check (true);
create policy "Service role full access analytics_visits"
  on analytics_visits for all using (true) with check (true);
create policy "Service role full access analytics_events"
  on analytics_events for all using (true) with check (true);
