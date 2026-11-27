-- Page indexing status from Search Console's URL Inspection API
-- (PRD-search-visibility, slice 18).
--
-- One row per URL holding Google's latest answer for it. Written daily by the
-- results-sla cron (lib/seo-metrics/inspect-urls.ts), which checks every URL in
-- the sitemap plus every page Search Console reported impressions for in the
-- last 90 days. Read by the Admin Panel's Page indexing list and by Claude
-- sessions through the service role.
--
-- issue is null when the page is fine. For a sitemap page that is any state
-- other than indexed; for a page outside the sitemap a redirect, an alternate
-- with a proper canonical, or a noindex is deliberate and is not an issue.
-- issue_since is when the current issue was first seen, kept while it persists.

create table if not exists seo_url_inspections (
  url text primary key,
  property text not null,
  in_sitemap boolean not null default false,
  verdict text,            -- PASS | PARTIAL | FAIL | NEUTRAL
  coverage_state text,     -- Google's wording, e.g. "Crawled - currently not indexed"
  indexing_state text,
  robots_txt_state text,
  page_fetch_state text,
  last_crawl_time timestamptz,
  google_canonical text,
  user_canonical text,
  issue text,
  issue_since timestamptz,
  inspection_link text,
  inspected_at timestamptz not null default now()
);

create index if not exists idx_seo_url_inspections_issue
  on seo_url_inspections (issue)
  where issue is not null;

-- Server-only table: RLS on with no policies, and no grants to client roles
-- (same shape as seo_daily_metrics).
alter table seo_url_inspections enable row level security;
revoke all on public.seo_url_inspections from anon, authenticated;
