-- Target-query watchlist + metric rollup (PRD-search-visibility, slice 06).

create table if not exists seo_target_queries (
  -- Lower-cased and space-collapsed, matching how Search Console reports queries.
  query text primary key check (query = lower(query) and char_length(query) between 2 and 120),
  created_by text,
  created_at timestamptz not null default now()
);

alter table seo_target_queries enable row level security;
revoke all on public.seo_target_queries from anon, authenticated;

-- Seeded from the curated target queries in lib/seo/llms-index.ts.
insert into seo_target_queries (query, created_by) values
  ('pillow for neck pain singapore', 'seed'),
  ('best cervical pillow singapore', 'seed'),
  ('customised pillow singapore', 'seed'),
  ('custom pillow singapore', 'seed'),
  ('neck support pillow singapore', 'seed'),
  ('bolster for side sleepers singapore', 'seed'),
  ('customisable bolster singapore', 'seed'),
  ('tech neck pillow singapore', 'seed')
on conflict (query) do nothing;

-- Per-key totals over a date range, summed in the database so "biggest movers"
-- across every query never pages thousands of daily rows to the server.
create or replace function public.seo_metric_rollup(
  p_source text,
  p_dimension text,
  p_from date,
  p_to date
)
returns table (key text, clicks bigint, impressions bigint, position_sum double precision)
language sql
stable
set search_path = public
as $$
  select m.key, sum(m.clicks)::bigint, sum(m.impressions)::bigint, sum(m.position_sum)
  from seo_daily_metrics m
  where m.source = p_source and m.dimension = p_dimension and m.date between p_from and p_to
  group by m.key;
$$;

revoke execute on function public.seo_metric_rollup(text, text, date, date) from public, anon, authenticated;
grant execute on function public.seo_metric_rollup(text, text, date, date) to service_role;
