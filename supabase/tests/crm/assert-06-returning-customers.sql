-- PRD-crm-retention-loop slice 06: the Returning customer rate's counts,
-- asserted against real Postgres (20261101150000_returning_customer_cohorts.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `slice 06 returning customers ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/crm/assert-06-returning-customers.sql
--
-- Everything runs in one transaction that is rolled back.

\set ON_ERROR_STOP 1
set client_min_messages = error;
begin;

do $$
begin
  assert not has_function_privilege('anon', 'public.admin_returning_customer_cohorts()', 'execute'), 'anon reads no cohort';
  assert not has_function_privilege('authenticated', 'public.admin_returning_customer_cohorts()', 'execute'), 'nor a signed-in user';
  assert has_function_privilege('service_role', 'public.admin_returning_customer_cohorts()', 'execute'), 'the server does';
end $$;

-- Nothing but this test's Customers, so the counts are its own.
delete from readjustment_bookings;
delete from order_items;
delete from orders;

do $$
declare
  ann uuid := '06060000-0000-4000-8000-0000000000a1'; -- bought again within 12 months
  bea uuid := '06060000-0000-4000-8000-0000000000b1'; -- a re-adjustment attended within 12 months
  cal uuid := '06060000-0000-4000-8000-0000000000c1'; -- both: counts once in came_back
  dan uuid := '06060000-0000-4000-8000-0000000000d1'; -- came back after 13 months: not within
  eve uuid := '06060000-0000-4000-8000-0000000000e1'; -- a booked (not attended) visit, a refunded and a fee Order: none counts
  fay uuid := '06060000-0000-4000-8000-0000000000f1'; -- first bought 31 Mar 23:30 SGT: a March customer, not April
  n   int := 0;
  r   record;
  v_first timestamptz := '2025-03-10T04:00:00Z';
begin
  insert into customers (id, email) values
    (ann, 'ann@assert-r06.test'), (bea, 'bea@assert-r06.test'), (cal, 'cal@assert-r06.test'),
    (dan, 'dan@assert-r06.test'), (eve, 'eve@assert-r06.test'), (fay, 'fay@assert-r06.test');

  -- One goods Order each, in March 2025 (Singapore).
  for r in select * from (values (ann, v_first), (bea, v_first), (cal, v_first), (dan, v_first), (eve, v_first),
                                 (fay, '2025-03-31T15:30:00Z'::timestamptz)) as x(cid, at) loop
    n := n + 1;
    insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at)
    values (gen_random_uuid(), 'R06-' || n, r.cid, 'x@assert-r06.test', 'delivered', 'SGD', 150, 150, '{}', r.at);
  end loop;
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind)
  select o.id, 'P', 'Pillow', 1, 150, 150, 'goods' from orders o where o.order_number like 'R06-%';

  -- Ann and Cal buy again 5 months on; Dan 13 months on.
  insert into orders (id, order_number, customer_id, email, status, currency, subtotal, total, shipping_address, paid_at) values
    ('06060000-0000-4000-8000-00000000a002', 'R06-A2', ann, 'ann@assert-r06.test', 'delivered', 'SGD', 90, 90, '{}', v_first + interval '5 months'),
    ('06060000-0000-4000-8000-00000000c002', 'R06-C2', cal, 'cal@assert-r06.test', 'delivered', 'SGD', 90, 90, '{}', v_first + interval '5 months'),
    ('06060000-0000-4000-8000-00000000d002', 'R06-D2', dan, 'dan@assert-r06.test', 'delivered', 'SGD', 90, 90, '{}', v_first + interval '13 months'),
    -- Eve's second Order was refunded, and her third was a re-adjustment fee: neither is a Purchase.
    ('06060000-0000-4000-8000-00000000e002', 'R06-E2', eve, 'eve@assert-r06.test', 'refunded', 'SGD', 90, 90, '{}', v_first + interval '2 months'),
    ('06060000-0000-4000-8000-00000000e003', 'R06-E3', eve, 'eve@assert-r06.test', 'confirmed', 'SGD', 40, 40, '{}', v_first + interval '3 months');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind) values
    ('06060000-0000-4000-8000-00000000a002', 'C', 'Case', 1, 90, 90, 'goods'),
    ('06060000-0000-4000-8000-00000000c002', 'C', 'Case', 1, 90, 90, 'goods'),
    ('06060000-0000-4000-8000-00000000d002', 'C', 'Case', 1, 90, 90, 'goods'),
    ('06060000-0000-4000-8000-00000000e002', 'C', 'Case', 1, 90, 90, 'goods');
  insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind, service_key)
  select '06060000-0000-4000-8000-00000000e003', 'SERVICE', 'Re-adjustment', 1, 40, 40, 'service', key from service_prices limit 1;

  -- Bea and Cal attended a re-adjustment 8 months on; Eve's is only booked.
  insert into readjustment_bookings (customer_id, purchase_source, unlisted_where, product_label, product_type, complimentary,
                                     fee_amount, location_name, start_at, end_at, guest_name, phone, email, status)
  select cid, 'unlisted', 'in_store', 'Mpillow', 'pillow', false, 40, 'Studio',
         v_first + interval '8 months', v_first + interval '8 months 1 hour', 'Guest', '+6590000000', 'x@assert-r06.test', st
    from (values (bea, 'attended'), (cal, 'attended'), (eve, 'booked')) as x(cid, st);

  select * into r from admin_returning_customer_cohorts();
  assert r.cohort_month = date '2025-03-01', 'March 2025, Singapore: ' || r.cohort_month;
  assert r.first_buyers = 6, 'six first-time customers, Fay at 23:30 on 31 March included: ' || r.first_buyers;
  assert r.via_purchase = 2, 'Ann and Cal bought again within 12 months: ' || r.via_purchase;
  assert r.via_readjustment = 2, 'Bea and Cal attended a re-adjustment: ' || r.via_readjustment;
  assert r.came_back = 3, 'Ann, Bea and Cal came back, Cal once: ' || r.came_back;
  assert (select count(*) from admin_returning_customer_cohorts()) = 1, 'one cohort';
end $$;

rollback;
select 'slice 06 returning customers ok';
