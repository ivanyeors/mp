-- AI crawler hits, daily rollup (PRD-search-visibility, slice 04).
--
-- proxy.ts classifies the user agent and, after the response is sent, calls
-- record_ai_crawler_hit() — one atomic upsert per hit, so concurrent hits on the
-- same (date, bot, path_group) never lose a count. Dates are Singapore days.

create table if not exists ai_crawler_hits (
  date date not null,
  bot text not null,
  path_group text not null,
  hits integer not null default 0,
  primary key (date, bot, path_group)
);

alter table ai_crawler_hits enable row level security;
revoke all on public.ai_crawler_hits from anon, authenticated;

create or replace function public.record_ai_crawler_hit(p_date date, p_bot text, p_path_group text)
returns void
language sql
set search_path = public
as $$
  insert into ai_crawler_hits (date, bot, path_group, hits)
  values (p_date, p_bot, p_path_group, 1)
  on conflict (date, bot, path_group) do update set hits = ai_crawler_hits.hits + 1;
$$;

-- Service role only: otherwise anyone with the anon key could inflate counts over RPC.
revoke execute on function public.record_ai_crawler_hit(date, text, text) from public, anon, authenticated;
grant execute on function public.record_ai_crawler_hit(date, text, text) to service_role;
