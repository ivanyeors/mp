-- Shared rate-limit counters (prod hardening, PRD-prod-hardening slices 10–11).
--
-- lib/rate-limit.ts counted requests in an in-process Map, so each serverless
-- instance kept its own tally and a flood spread across instances was never
-- stopped. These counters live in the database instead, where every instance
-- sees the same number.
--
-- rate_limit_hits: one row per (bucket, key, fixed window). `bucket` names the
-- feature ("booking", "checkout", …) and `key` the caller (an IP, an email, a
-- phone number). `window_start` is the start of the fixed window the hit fell
-- in, so a key's count resets when the window rolls over.
--
-- rate_limit_hit(): counts one hit and says whether the key is now over `p_max`
-- for the window — one atomic upsert, so concurrent requests cannot both slip
-- under the limit. Windows older than a day are swept on roughly one call in a
-- hundred; no cron needed.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated,
-- and the function is executable by service_role alone.
--
-- Idempotent.

create table if not exists public.rate_limit_hits (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, key, window_start)
);

create index if not exists rate_limit_hits_window_start_idx
  on public.rate_limit_hits (window_start);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

create or replace function public.rate_limit_hit(
  p_bucket         text,
  p_key            text,
  p_window_seconds integer,
  p_max            integer
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_window_start timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  v_hits integer;
begin
  insert into rate_limit_hits (bucket, key, window_start, hits)
  values (p_bucket, p_key, v_window_start, 1)
  on conflict (bucket, key, window_start)
    do update set hits = rate_limit_hits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return v_hits > p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
