-- Search & AI visibility snapshots (PRD-search-visibility, slice 01).
--
-- One row per (date, source, dimension, key). Written daily by the GSC ingest
-- chained in the results-sla cron; read only by admin server actions through the
-- service role. Keeps history past Search Console's 16-month retention.
--
-- position_sum = avg position × impressions, so a rollup over any rows gives the
-- impression-weighted position exactly (Σposition_sum / Σimpressions). CTR is
-- never stored: it is always Σclicks / Σimpressions of the rows being rolled up.

create table if not exists seo_daily_metrics (
  date date not null,
  source text not null,          -- gsc_web | gsc_genai | bing_ai | ga4
  dimension text not null,       -- total | query | page | country | device
  key text not null default '',  -- '' for total
  clicks integer not null default 0,
  impressions integer not null default 0,
  position_sum double precision not null default 0,
  extra jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (date, source, dimension, key)
);

create index if not exists idx_seo_daily_metrics_source_dim_date
  on seo_daily_metrics (source, dimension, date desc);

-- Server-only table: RLS on with no policies, and no grants to client roles
-- (same shape as 20260917033807_security_advisor_hardening.sql section 3).
alter table seo_daily_metrics enable row level security;
revoke all on public.seo_daily_metrics from anon, authenticated;
