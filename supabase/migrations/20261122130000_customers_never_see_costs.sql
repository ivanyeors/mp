-- Customers never see our costs (#455). Owner, 2026-11-22: "customers must
-- never see our build costs" and "customer can only ever see the final
-- shipping amount billed to them, never any costs".
--
-- 1. order_items.customization_snapshot is readable by the signed-in customer
--    ("Customers read own order_items", 0039; column granted in
--    20260915170000). A Result order line's snapshot carried the build's cost
--    (`cogs`) and a `costPrice` key on each service line. The code no longer
--    writes either (lib/results/order-build-snapshot.ts); order_items.unit_cost
--    and total_cost keep the cost for staff. This strips both keys from rows
--    written before. Safe to run again: re-apply after the build that stops
--    writing them is promoted, so a Result accepted on the previous build is
--    cleaned too.
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
-- Idempotent. Apply in either order with the code that ships with it.

update public.order_items
set customization_snapshot = customization_snapshot - 'cogs'
where customization_snapshot ? 'cogs';

update public.order_items
set customization_snapshot = jsonb_set(
  customization_snapshot,
  '{service_lines}',
  (
    select coalesce(
      jsonb_agg(
        case when jsonb_typeof(l.line) = 'object' then l.line - 'costPrice' else l.line end
        order by l.n
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(customization_snapshot -> 'service_lines') with ordinality as l(line, n)
  )
)
where jsonb_typeof(customization_snapshot -> 'service_lines') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(customization_snapshot -> 'service_lines') as s(line)
    where jsonb_typeof(s.line) = 'object' and s.line ? 'costPrice'
  );

revoke select on public.shipping_methods from anon, authenticated;
grant select (
  id, slug, content, base_rate, free_above, currency, countries, is_active,
  position, created_at, updated_at, rate_source, easyship_strategy,
  easyship_courier_service_id, collect_location_id
) on public.shipping_methods to anon, authenticated;
