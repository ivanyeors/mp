-- Customers never see our costs (#455). Owner, 2026-11-22: "customers must
-- never see our build costs" and "customer can only ever see the final
-- shipping amount billed to them, never any costs".
--
-- 1. order_items.customization_snapshot is readable by the signed-in customer
--    ("Customers read own order_items", 0039; column granted in
--    20260915170000). A Result order line's snapshot carried the build's cost
--    (`cogs`) and a `costPrice` key on each service line. The code no longer
--    writes either (lib/results/order-build-snapshot.ts); order_items.unit_cost
--    and total_cost keep the cost for staff. A merge to main is only staged:
--    mpillow.com keeps running the previous build, which still writes both
--    keys, until the owner promotes. So a trigger strips them on every write
--    of the column, whichever build wrote it, and the update below cleans
--    rows written before.
-- 2. shipping_methods is readable with the public anon key ("Public read
--    active shipping_methods", 0028), markup included. A live method's price
--    is Easyship's charge plus that markup, rounded, so the markup gives away
--    what the courier costs us. SELECT is re-granted column by column without
--    markup_percent, markup_fixed and rate_rounding. Server code reads
--    shipping_methods as the service role and is unchanged; nothing reads it
--    as anon or authenticated (checked 2026-11-22).
--
-- NEW COLUMNS on shipping_methods are NOT readable by anon/authenticated until
-- granted, e.g. grant select (new_col) on public.shipping_methods to anon,
-- authenticated; lib/ecommerce/__tests__/cost-column-grants.test.ts fails
-- until a new column is either granted or hidden.
--
-- Idempotent. Apply before or after the code ships, and before or after the
-- build is promoted: the trigger covers the gap either way.

create or replace function public.snapshot_without_costs(snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when snapshot is null or jsonb_typeof(snapshot) <> 'object' then snapshot
    when jsonb_typeof(snapshot -> 'service_lines') is distinct from 'array' then snapshot - 'cogs'
    else jsonb_set(
      snapshot - 'cogs',
      '{service_lines}',
      (
        select coalesce(
          jsonb_agg(
            case when jsonb_typeof(l.line) = 'object' then l.line - 'costPrice' else l.line end
            order by l.n
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(snapshot -> 'service_lines') with ordinality as l(line, n)
      )
    )
  end;
$$;

create or replace function public.order_items_strip_snapshot_costs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.customization_snapshot := public.snapshot_without_costs(new.customization_snapshot);
  return new;
end;
$$;

create or replace trigger order_items_strip_snapshot_costs
  before insert or update of customization_snapshot on public.order_items
  for each row execute function public.order_items_strip_snapshot_costs();

update public.order_items
set customization_snapshot = public.snapshot_without_costs(customization_snapshot)
where customization_snapshot is distinct from public.snapshot_without_costs(customization_snapshot);

revoke select on public.shipping_methods from anon, authenticated;
grant select (
  id, slug, content, base_rate, free_above, currency, countries, is_active,
  position, created_at, updated_at, rate_source, easyship_strategy,
  easyship_courier_service_id, collect_location_id
) on public.shipping_methods to anon, authenticated;
