-- Migration slice 06: the Claim link, the voucher's state, and the surfaces
-- that count them (20261020121000, 20261020121100, 20261020200100).
--
-- Run against a database with every migration applied (a local Postgres with
-- the Supabase roles, or a Supabase branch), as the owner role:
--
--   psql -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/customer-migration/assert-06-welcome.sql
--
-- Everything runs in one transaction that is rolled back, so it leaves no
-- rows behind. Not part of CI. A failed assert stops with its message.

begin;

-- ---------------------------------------------------------------------
-- Server-only: nothing for anon or a signed-in Customer
-- ---------------------------------------------------------------------
do $$
declare
  r text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.customer_claim_links'::regclass),
    'customer_claim_links has RLS off';
  assert not exists (select 1 from pg_policies where tablename = 'customer_claim_links'),
    'customer_claim_links has a policy';
  foreach r in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(r, 'public.customer_claim_links', 'select,insert,update,delete'),
      format('%s holds a privilege on customer_claim_links', r);
    assert not has_sequence_privilege(r, 'public.customer_claim_links_id_seq', 'usage,select,update'),
      format('%s holds a privilege on the claim links sequence', r);
    assert not has_table_privilege(r, 'public.admin_welcome_voucher_summary', 'select'),
      format('%s can select admin_welcome_voucher_summary', r);
    assert not has_function_privilege(r, 'public.open_claim_link(text, boolean)', 'execute'),
      format('%s can execute open_claim_link', r);
    assert not has_function_privilege(r, 'public.mint_claim_link(uuid, text, text)', 'execute'),
      format('%s can execute mint_claim_link', r);
    assert not has_function_privilege(r, 'public.welcome_voucher_state(int, boolean, timestamptz)', 'execute'),
      format('%s can execute welcome_voucher_state', r);
  end loop;
  assert has_function_privilege('service_role', 'public.open_claim_link(text, boolean)', 'execute'),
    'service_role cannot execute open_claim_link';
  assert has_function_privilege('service_role', 'public.mint_claim_link(uuid, text, text)', 'execute'),
    'service_role cannot execute mint_claim_link';
end $$;

-- ---------------------------------------------------------------------
-- Fixtures: four Migrated customers and one platform Customer
-- ---------------------------------------------------------------------
insert into public.customer_import_batches (id, source, file_name, file_sha256, rows_total, rows_done, applied_at, exported_at, created, merged)
values ('b6000000-0000-4000-8000-000000000001', 'shopify_customers_csv', 'm06.csv', repeat('6', 64), 4, 4, now(), '2026-10-20', 4, 0);

insert into public.customers (id, email, first_name) values
  ('c6000000-0000-4000-8000-000000000001', 'm06-jane@x.test', 'Jane'),
  ('c6000000-0000-4000-8000-000000000002', 'm06-kai@x.test',  'Kai'),
  ('c6000000-0000-4000-8000-000000000003', 'm06-lee@x.test',  null),
  ('c6000000-0000-4000-8000-000000000004', 'm06-mo@x.test',   'Mo'),
  ('c6000000-0000-4000-8000-000000000005', 'm06-plat@x.test', 'Pat');

insert into public.migrated_customers
  (customer_id, shopify_customer_id, batch_id, created_by_import, email_marketing_at_export, exported_at, imported_at)
values
  ('c6000000-0000-4000-8000-000000000001', 906001, 'b6000000-0000-4000-8000-000000000001', true, 'yes', current_date, now()),
  ('c6000000-0000-4000-8000-000000000002', 906002, 'b6000000-0000-4000-8000-000000000001', true, 'yes', current_date, now()),
  ('c6000000-0000-4000-8000-000000000003', 906003, 'b6000000-0000-4000-8000-000000000001', true, 'no',  current_date, now()),
  ('c6000000-0000-4000-8000-000000000004', 906004, 'b6000000-0000-4000-8000-000000000001', true, 'yes', current_date, now());

-- One token per email: Jane got the announcement and the reminder.
select public.mint_claim_link('c6000000-0000-4000-8000-000000000001', repeat('a', 64), 'migration_announcement');
select public.mint_claim_link('c6000000-0000-4000-8000-000000000001', repeat('b', 64), 'migration_reminder');
select public.mint_claim_link('c6000000-0000-4000-8000-000000000002', repeat('c', 64), 'migration_announcement');
select public.mint_claim_link('c6000000-0000-4000-8000-000000000003', repeat('d', 64), 'migration_announcement');
select public.mint_claim_link('c6000000-0000-4000-8000-000000000005', repeat('e', 64), 'migration_announcement');

do $$
begin
  begin
    perform public.mint_claim_link('c6000000-0000-4000-8000-000000000001', 'PLAINTEXT-TOKEN', 'migration_announcement');
    assert false, 'a plaintext token was stored as a hash';
  exception when check_violation then null;
  end;
  begin
    perform public.mint_claim_link('c6000000-0000-4000-8000-000000000001', repeat('a', 64), 'migration_reminder');
    assert false, 'one token hash was stored twice';
  exception when unique_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Opening a link: records the click, says whose it is
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  l record;
begin
  -- Unknown: no row, nothing written.
  assert not exists (select 1 from public.open_claim_link(repeat('f', 64), true)), 'an unknown token returned a row';

  -- Signed out: the click counts, and the row says whose link it is.
  select * into r from public.open_claim_link(repeat('a', 64), true);
  assert (r.customer_id, r.first_name, r.email) = ('c6000000-0000-4000-8000-000000000001'::uuid, 'Jane', 'm06-jane@x.test'),
    format('open_claim_link returned %s', r);
  perform public.open_claim_link(repeat('a', 64), true);
  select * into l from public.customer_claim_links where token_hash = repeat('a', 64);
  assert l.click_count = 2 and l.first_clicked_at = now() and l.last_clicked_at = now(),
    format('two signed-out opens recorded %s', l);

  -- The signed-in return trip changes nothing once the link was clicked...
  update public.customer_claim_links set first_clicked_at = now() - interval '1 hour', last_clicked_at = now() - interval '1 hour'
   where token_hash = repeat('a', 64);
  perform public.open_claim_link(repeat('a', 64), false);
  select * into l from public.customer_claim_links where token_hash = repeat('a', 64);
  assert l.click_count = 2 and l.last_clicked_at = now() - interval '1 hour',
    'a signed-in visit to a clicked link counted again';

  -- ...and is the first click when there was none.
  perform public.open_claim_link(repeat('c', 64), false);
  select * into l from public.customer_claim_links where token_hash = repeat('c', 64);
  assert l.click_count = 1 and l.first_clicked_at = now(), 'a signed-in first visit was not recorded';

  -- Every token stays valid: the older email still opens.
  assert exists (select 1 from public.open_claim_link(repeat('b', 64), true)), 'the reminder token stopped working';
end $$;

-- An import undo keeps a Customer it emailed: a Claim link is a foreign key
-- to customers, which customer_import_undo_plan reads as referenced. Kai
-- has nothing else yet.
do $$
declare
  p record;
begin
  select * into p from public.customer_import_undo_plan('b6000000-0000-4000-8000-000000000001')
   where customer_id = 'c6000000-0000-4000-8000-000000000002';
  assert p.action = 'keep', format('an emailed, unclaimed Customer would be %s by an undo', p.action);
end $$;

-- ---------------------------------------------------------------------
-- An email change voids the links of a Customer who has not Claimed
-- ---------------------------------------------------------------------
-- Mo is Claimed (below); Lee is not.
update public.migrated_customers set claimed_at = now() where customer_id = 'c6000000-0000-4000-8000-000000000004';
select public.mint_claim_link('c6000000-0000-4000-8000-000000000004', repeat('9', 64), 'migration_announcement');

-- A case-only change is the same address.
update public.customers set email = 'M06-LEE@x.test' where id = 'c6000000-0000-4000-8000-000000000003';
do $$
begin
  assert exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000003'),
    'a case-only email change voided the links';
end $$;

update public.customers set email = 'm06-lee-new@x.test' where id = 'c6000000-0000-4000-8000-000000000003';
update public.customers set email = 'm06-mo-new@x.test'  where id = 'c6000000-0000-4000-8000-000000000004';
update public.customers set email = 'm06-pat-new@x.test' where id = 'c6000000-0000-4000-8000-000000000005';
-- Another field changing does not touch them.
update public.customers set first_name = 'Kai T' where id = 'c6000000-0000-4000-8000-000000000002';

do $$
begin
  assert not exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000003'),
    'an unclaimed Migrated customer kept their links after an email change';
  assert not exists (select 1 from public.open_claim_link(repeat('d', 64), true)),
    'the old email''s token still opens after the change';
  assert not exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000005'),
    'a Customer with no Claim kept their links after an email change';
  assert exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000004'),
    'a Claimed Customer lost their links (the campaign history) on an email change';
  assert exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000002'),
    'a change to another field voided the links';
end $$;

-- ---------------------------------------------------------------------
-- The voucher's state: one rule, in SQL and in TypeScript
-- ---------------------------------------------------------------------
-- The same table as lib/customer-migration/__tests__/welcome-voucher.test.ts.
do $$
begin
  assert public.welcome_voucher_state(null, null, null) is null, 'no voucher is not null';
  assert public.welcome_voucher_state(0, true, now() + interval '1 day') = 'issued', 'unused, unexpired';
  assert public.welcome_voucher_state(0, true, null) = 'issued', 'unused, no expiry';
  assert public.welcome_voucher_state(1, true, now() + interval '1 day') = 'used', 'redeemed';
  assert public.welcome_voucher_state(1, true, now() - interval '1 day') = 'used', 'redeemed, then past expiry';
  assert public.welcome_voucher_state(0, true, now()) = 'expired', 'at its expiry';
  assert public.welcome_voucher_state(0, false, now() + interval '1 day') = 'expired', 'switched off';
end $$;

-- Jane claims through the real function, with terms that issue.
update public.site_settings set value = 'true' where key = 'welcome_voucher_enabled';
insert into public.site_settings (key, value) values
  ('welcome_voucher_type', 'fixed_amount'),
  ('welcome_voucher_value', '20'),
  ('welcome_voucher_min_order', '60'),
  ('welcome_voucher_issue_until', '2099-12-31')
on conflict (key) do update set value = excluded.value;

do $$
declare
  r record;
begin
  select * into r from public.claim_migrated_customer('c6000000-0000-4000-8000-000000000001');
  assert r.claimed and r.voucher_issued, format('Jane''s Claim issued no voucher: %s', r);
end $$;

-- Kai's voucher is used and paid for; Mo's expired; Lee has none.
insert into public.coupons (code, discount_type, discount_value, currency, usage_limit, usage_count, per_customer_limit, expires_at, customer_id, issued_for)
values
  ('WB-M06KAI0000', 'fixed_amount', 20, 'SGD', 1, 1, 1, now() + interval '30 days', 'c6000000-0000-4000-8000-000000000002', 'welcome_back'),
  ('WB-M06MO00000', 'free_shipping', 1, 'SGD', 1, 0, 1, now() - interval '1 day', 'c6000000-0000-4000-8000-000000000004', 'welcome_back');
-- A bearer code on a paid order is not voucher revenue.
insert into public.coupons (code, discount_type, discount_value, currency) values ('M06-BEARER', 'fixed_amount', 5, 'SGD');

insert into public.orders (order_number, customer_id, email, subtotal, discount_amount, total, shipping_address, coupon_id, paid_at, status)
values
  ('M06-1', 'c6000000-0000-4000-8000-000000000002', 'm06-kai@x.test', 120, 20, 100, '{}',
   (select id from public.coupons where code = 'WB-M06KAI0000'), now(), 'confirmed'),
  -- Unpaid: not revenue.
  ('M06-2', 'c6000000-0000-4000-8000-000000000002', 'm06-kai@x.test', 80, 20, 60, '{}',
   (select id from public.coupons where code = 'WB-M06KAI0000'), null, 'pending'),
  ('M06-3', 'c6000000-0000-4000-8000-000000000005', 'm06-pat-new@x.test', 50, 5, 45, '{}',
   (select id from public.coupons where code = 'M06-BEARER'), now(), 'confirmed');

-- ---------------------------------------------------------------------
-- The Customer overview
-- ---------------------------------------------------------------------
do $$
declare
  o record;
begin
  select * into o from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000001';
  assert o.claim_link_first_clicked_at = (select min(first_clicked_at) from public.customer_claim_links
                                           where customer_id = 'c6000000-0000-4000-8000-000000000001'),
    'claim_link_first_clicked_at is not the first click of any of the Customer''s links';
  assert o.welcome_voucher_state = 'issued', format('Jane''s voucher reads %s', o.welcome_voucher_state);
  assert (select welcome_voucher_state from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000002') = 'used',
    'Kai''s used voucher';
  assert (select welcome_voucher_state from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000004') = 'expired',
    'Mo''s expired voucher';
  assert (select welcome_voucher_state = 'none' and claim_link_first_clicked_at is null
            from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000003'),
    'Lee has no voucher and no click';
  -- The Voucher filter: issued, unused.
  assert (select array_agg(id) from public.admin_customer_overview where welcome_voucher_state = 'issued')
         = (select array_agg(c.customer_id) from public.coupons c
             where c.issued_for = 'welcome_back' and c.usage_count = 0 and c.is_active and c.expires_at > now()),
    'the Issued, unused filter disagrees with coupons counted by hand';
  -- The view still has one row per Customer.
  assert (select count(*) from public.admin_customer_overview) = (select count(*) from public.customers),
    'the overview has a row per Customer no longer';
end $$;

-- ---------------------------------------------------------------------
-- The Migration card against migrated_customers and orders, by hand
-- ---------------------------------------------------------------------
do $$
declare
  s record;
  h record;
begin
  select * into s from public.admin_customer_migration_summary;
  select
    count(*) filter (where exists (select 1 from public.customer_claim_links l
                                    where l.customer_id = m.customer_id and l.first_clicked_at is not null)) as clicked,
    count(*) filter (where exists (select 1 from public.coupons c
                                    where c.customer_id = m.customer_id and c.issued_for = 'welcome_back')) as issued,
    count(*) filter (where exists (select 1 from public.coupons c
                                    where c.customer_id = m.customer_id and c.issued_for = 'welcome_back'
                                      and c.usage_count > 0)) as used
    into h
    from public.migrated_customers m;
  assert (s.clicked, s.vouchers_issued, s.vouchers_used) = (h.clicked, h.issued, h.used),
    format('Migration card %s, by hand %s', s, h);
  assert (s.clicked, s.vouchers_issued, s.vouchers_used) = (2::bigint, 3::bigint, 1::bigint),
    format('the fixtures should read clicked 2, issued 3, used 1: %s', s);

  select count(*) as orders, coalesce(sum(o.total), 0) as revenue into h
    from public.orders o
   where o.paid_at is not null
     and o.coupon_id in (select id from public.coupons where issued_for = 'welcome_back');
  assert (s.voucher_orders, s.voucher_revenue) = (h.orders, h.revenue),
    format('Revenue %s / %s, by hand %s', s.voucher_orders, s.voucher_revenue, h);
  assert (s.voucher_orders, s.voucher_revenue) = (1::bigint, 100::numeric),
    format('the fixtures should read one paid order of 100: %s / %s', s.voucher_orders, s.voucher_revenue);

  -- Slice 12's columns are unchanged by the redefinition.
  assert s.imported = (select count(*) from public.migrated_customers), 'imported moved';
end $$;

-- ---------------------------------------------------------------------
-- The Discounts card
-- ---------------------------------------------------------------------
do $$
declare
  v record;
begin
  select * into v from public.admin_welcome_voucher_summary;
  assert (v.issued, v.redeemed, v.outstanding, v.expired, v.free_shipping) = (3::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint),
    format('voucher counts %s', v);
  -- Jane's 20 is the live liability; Kai's 20 the realised cost; Mo's free
  -- shipping is counted, never valued.
  assert (v.value_issued, v.value_outstanding, v.value_redeemed) = (40::numeric, 20::numeric, 20::numeric),
    format('voucher values %s', v);
end $$;

-- ---------------------------------------------------------------------
-- Deleting a Customer takes their links
-- ---------------------------------------------------------------------
delete from public.orders where customer_id = 'c6000000-0000-4000-8000-000000000002';
delete from public.customers where id = 'c6000000-0000-4000-8000-000000000002';
do $$
begin
  assert not exists (select 1 from public.customer_claim_links where customer_id = 'c6000000-0000-4000-8000-000000000002'),
    'a deleted Customer''s links survived';
  assert not exists (select 1 from public.open_claim_link(repeat('c', 64), true)),
    'a deleted Customer''s token still opens';
end $$;

select 'slice 06 welcome asserts ok';

rollback;
