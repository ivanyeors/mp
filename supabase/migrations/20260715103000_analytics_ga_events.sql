-- GA4 BigQuery export staging (ADR 0007). Stitch to analytics_visitors via ga_client_id.

create table if not exists analytics_ga_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  event_name text not null,
  event_timestamp timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  visitor_id uuid references analytics_visitors (id),
  synced_at timestamptz not null default now()
);

create index if not exists idx_analytics_ga_events_client_id
  on analytics_ga_events (client_id);
create index if not exists idx_analytics_ga_events_visitor_id
  on analytics_ga_events (visitor_id)
  where visitor_id is not null;
create index if not exists idx_analytics_ga_events_unstitched
  on analytics_ga_events (client_id)
  where visitor_id is null;

alter table analytics_ga_events enable row level security;

create policy "Service role full access analytics_ga_events"
  on analytics_ga_events for all using (true) with check (true);
