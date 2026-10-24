-- Loyalty points slice 05, end to end (PRD-loyalty-points; ADR 0030 f, h-j):
-- a Migrated customer claims, holds the 1,000-point Claim bonus (S$10), and a
-- S$25 cover sheet takes the S$10 off at checkout. The Claim
-- (20261021150000) and the reservation (20261021140000) are each asserted in
-- depth elsewhere (customer-migration/assert-05-claim.sql,
-- loyalty-points/assert-04-spending.sql); this proves they meet.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 05 end to end ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-05-claim-to-checkout.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS05-%';
delete from customers where email like '%@assertpts05.test';
delete from customer_import_batches where file_name = 'assert-pts05.csv';

do $$
begin
  assert not exists (select 1 from customer_campaign_sends),
    'this assert needs a database with no campaign sends: the Claim bonus window is then open';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into site_settings (key, value) values
  ('points_enabled', 'true'),
  ('points_launch_at', (now() - interval '1 day')::text),
  ('points_claim_bonus', '1000'),
  ('points_claim_bonus_months', '3'),
  ('points_min_redeem', '500'),
  ('points_max_share', '0.5')
on conflict (key) do update set value = excluded.value;

insert into customer_import_batches (id, source, file_name, file_sha256, rows_total, exported_at)
values ('05550555-0000-4000-8000-0000000000b0', 'shopify_customers_csv', 'assert-pts05.csv', repeat('c', 64), 1, '2026-10-20');
insert into customers (id, email, first_name) values ('05550555-0000-4000-8000-000000000001', 'wei@assertpts05.test', 'Wei');
insert into migrated_customers (customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at)
values ('05550555-0000-4000-8000-000000000001', '05550555-0000-4000-8000-0000000000b0', true, 'yes', date '2026-10-15');

-- A S$25 cover sheet, S$10 of it in points, as checkout writes the pending Order.
insert into orders (id, order_number, customer_id, email, status, subtotal, discount_amount, total, shipping_address, points_spent, points_discount)
values ('05550555-1000-4000-8000-000000000001', 'PTS05-1', '05550555-0000-4000-8000-000000000001', 'wei@assertpts05.test',
        'pending', 25, 10, 15, '{}', 1000, 10);

-- ---------------------------------------------------------------- the path
do $$
declare
  c record;
  b record;
begin
  -- Sign-in: the Claim grants the bonus, and its email is due.
  select * into c from claim_migrated_customer('05550555-0000-4000-8000-000000000001');
  assert c.claimed and c.bonus_granted and c.bonus_email_due, format('the Claim: %s', c);

  -- The Points card: 1,000 available, S$10.
  select * into b from points_balance('05550555-0000-4000-8000-000000000001');
  assert b.available = 1000, format('available after the Claim: %s', b.available);

  -- Checkout: half of S$25 is S$12.50, so S$10 of points fits; the
  -- reservation takes all 1,000.
  assert reserve_points('05550555-0000-4000-8000-000000000001', '05550555-1000-4000-8000-000000000001', 1000) = 'reserved',
    'the S$25 cover sheet did not take the S$10';
  select * into b from points_balance('05550555-0000-4000-8000-000000000001');
  assert b.available = 0, format('available after checkout: %s', b.available);
  assert (select array_agg(kind::text order by created_at, kind) from points_ledger
           where customer_id = '05550555-0000-4000-8000-000000000001') = array['claim_bonus', 'spend'],
    'the ledger is the bonus, then the spend';

  -- A second sign-in grants nothing more.
  select * into c from claim_migrated_customer('05550555-0000-4000-8000-000000000001');
  assert not c.claimed and not c.bonus_granted, format('the second sign-in: %s', c);
end $$;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS05-%';
delete from customers where email like '%@assertpts05.test';
delete from customer_import_batches where file_name = 'assert-pts05.csv';
update site_settings set value = 'false' where key = 'points_enabled';
delete from site_settings where key = 'points_launch_at';

select 'points slice 05 end to end ok';
