-- The inventory views run with their owner's rights (no security_invoker),
-- so enabling RLS on inventory_transactions / items / bom_lines in
-- 20260902000000 did not stop an anonymous PostgREST caller from reading
-- stock levels and margins through them. Staff pages read the views as
-- the authenticated role; everything else goes through the service role.
-- Idempotent.
do $$
declare
  v text;
begin
  foreach v in array array[
    'inventory_balances', 'product_buildable', 'bolster_buildable',
    'variant_stock', 'order_margins'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on public.%I from anon', v);
    end if;
  end loop;
  -- Margins are only ever read by server code.
  if to_regclass('public.order_margins') is not null then
    execute 'revoke all on public.order_margins from authenticated';
  end if;
end $$;
