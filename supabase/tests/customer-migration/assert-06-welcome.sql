-- Migration slice 06: the Claim link, and the surfaces that count it
-- (20261020121000, 20261020200100), as PRD-loyalty-points slice 06 rebuilt
-- them (20261021160000): the Customer overview's points_available and
-- claim_bonus_at, and the Migration card's claim_bonuses,
-- migrated_points_spent, points_orders and points_revenue, in place of the
-- retired voucher's columns. Nothing of the voucher is left.
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
    assert not has_function_privilege(r, 'public.open_claim_link(text, boolean)', 'execute'),
      format('%s can execute open_claim_link', r);
    assert not has_function_privilege(r, 'public.mint_claim_link(uuid, text, text)', 'execute'),
      format('%s can execute mint_claim_link', r);
    -- The two views, rebuilt: still nothing for the client roles, by table or by column.
    assert not has_table_privilege(r, 'public.admin_customer_overview', 'select'),
      format('%s can select admin_customer_overview', r);
    assert not has_table_privilege(r, 'public.admin_customer_migration_summary', 'select'),
      format('%s can select admin_customer_migration_summary', r);
    assert not has_column_privilege(r, 'public.admin_customer_overview', 'points_available', 'select'),
      format('%s can select admin_customer_overview.points_available', r);
    assert not has_column_privilege(r, 'public.admin_customer_overview', 'claim_bonus_at', 'select'),
      format('%s can select admin_customer_overview.claim_bonus_at', r);
  end loop;
  assert has_function_privilege('service_role', 'public.open_claim_link(text, boolean)', 'execute'),
    'service_role cannot execute open_claim_link';
  assert has_function_privilege('service_role', 'public.mint_claim_link(uuid, text, text)', 'execute'),
    'service_role cannot execute mint_claim_link';
  assert has_table_privilege('service_role', 'public.admin_customer_overview', 'select'),
    'service_role cannot select admin_customer_overview';
  assert has_table_privilege('service_role', 'public.admin_customer_migration_summary', 'select'),
    'service_role cannot select admin_customer_migration_summary';
  assert (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.admin_customer_overview'::regclass),
    'admin_customer_overview no longer runs as the invoker';
  assert (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.admin_customer_migration_summary'::regclass),
    'admin_customer_migration_summary no longer runs as the invoker';
end $$;

-- ---------------------------------------------------------------------
-- Nothing of the voucher is left (PRD-loyalty-points slice 06)
-- ---------------------------------------------------------------------
do $$
begin
  assert not exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname ~ 'voucher'),
    format('a voucher relation is left: %s',
           (select string_agg(relname, ', ') from pg_class where relnamespace = 'public'::regnamespace and relname ~ 'voucher'));
  assert not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname ~ 'voucher'),
    'a voucher function is left';
  assert not exists (select 1 from public.site_settings where key ~ '^welcome'),
    format('voucher settings are left: %s', (select string_agg(key, ', ') from public.site_settings where key ~ '^welcome'));
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name like 'admin\_customer\_%' and column_name ~ 'voucher'),
    'a view still has a voucher column';
  -- Coupons are bearer codes: nothing ties one to a Customer.
  assert not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'coupons' and column_name ~ '^(customer_id|issued)'),
    format('coupons still has %s', (select string_agg(column_name, ', ') from information_schema.columns
                                     where table_schema = 'public' and table_name = 'coupons' and column_name ~ '^(customer_id|issued)'));
  assert not exists (select 1 from pg_constraint
                      where conrelid = 'public.coupons'::regclass and confrelid = 'public.customers'::regclass),
    'coupons still references customers';
  assert not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'coupons'
                      and (indexname ~ 'customer' or indexdef ~ 'customer')),
    'a coupons index on a Customer is left';
  -- The new columns, typed as the read model expects.
  assert (select data_type from information_schema.columns
           where table_name = 'admin_customer_overview' and column_name = 'points_available') = 'integer',
    'points_available is not an integer';
  assert (select data_type from information_schema.columns
           where table_name = 'admin_customer_overview' and column_name = 'claim_bonus_at') = 'timestamp with time zone',
    'claim_bonus_at is not a timestamptz';
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
-- Points and the Claim bonus (PRD-loyalty-points slices 02 to 06)
-- ---------------------------------------------------------------------
-- Points on. Before any campaign email the Claim bonus window is open, so a
-- Claim through the real function grants it.
update public.site_settings set value = 'true' where key = 'points_enabled';
update public.site_settings set value = '1000' where key = 'points_claim_bonus';

do $$
declare
  r record;
begin
  assert not exists (select 1 from public.customer_campaign_sends),
    'this assert needs a database with no campaign sends: the Claim bonus window counts from the first one';
  -- Jane and Kai claim and are granted the bonus; Mo was claimed above,
  -- before points, so holds none until a sign-in.
  select * into r from public.claim_migrated_customer('c6000000-0000-4000-8000-000000000001');
  assert r.claimed and r.bonus_granted, format('Jane''s Claim: %s', r);
  select * into r from public.claim_migrated_customer('c6000000-0000-4000-8000-000000000002');
  assert r.claimed and r.bonus_granted, format('Kai''s Claim: %s', r);
  -- Staff give Mo 500, and Pat (a platform Customer) 2,000.
  perform public.adjust_points('c6000000-0000-4000-8000-000000000004', 500, 'Goodwill', null);
  perform public.adjust_points('c6000000-0000-4000-8000-000000000005', 2000, 'Goodwill', null);
end $$;

-- Kai spends his bonus on a paid shop order, and reserves 500 on one not paid
-- yet; Pat spends 1,000 on a paid order. Lee has nothing.
insert into public.orders (order_number, customer_id, email, subtotal, discount_amount, points_spent, points_discount, total, shipping_address, paid_at, status)
values
  ('M06-1', 'c6000000-0000-4000-8000-000000000002', 'm06-kai@x.test', 110, 10, 1000, 10, 100, '{}', now(), 'confirmed'),
  -- Unpaid: not revenue, and not points spent.
  ('M06-2', 'c6000000-0000-4000-8000-000000000002', 'm06-kai@x.test', 60, 5, 500, 5, 55, '{}', null, 'pending'),
  -- Paid with points, by a platform Customer: not the Migration card's.
  ('M06-3', 'c6000000-0000-4000-8000-000000000005', 'm06-pat-new@x.test', 50, 10, 1000, 10, 40, '{}', now(), 'confirmed'),
  -- Paid without points: not the card's either.
  ('M06-4', 'c6000000-0000-4000-8000-000000000001', 'm06-jane@x.test', 30, 0, 0, 0, 30, '{}', now(), 'confirmed');

insert into public.points_ledger (customer_id, kind, points, order_id)
select o.customer_id, 'spend', -o.points_spent, o.id
  from public.orders o
 where o.order_number in ('M06-1', 'M06-3');

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
  assert (o.points_available, o.claim_bonus_at) = (1000, now()),
    format('Jane reads %s points, bonus at %s', o.points_available, o.claim_bonus_at);
  -- Kai spent his bonus: none available, the bonus still dated.
  select * into o from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000002';
  assert o.points_available = 0 and o.claim_bonus_at = now(),
    format('Kai reads %s points, bonus at %s', o.points_available, o.claim_bonus_at);
  -- Mo has points and no bonus; Lee has neither, and no click.
  select * into o from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000004';
  assert o.points_available = 500 and o.claim_bonus_at is null,
    format('Mo reads %s points, bonus at %s', o.points_available, o.claim_bonus_at);
  select * into o from public.admin_customer_overview where id = 'c6000000-0000-4000-8000-000000000003';
  assert o.points_available = 0 and o.claim_bonus_at is null and o.claim_link_first_clicked_at is null,
    format('Lee reads %s', o);

  -- For every Customer: the balance is the ledger's sum, as points_balance()
  -- counts it, and the bonus its one claim_bonus entry.
  assert not exists (
    select 1 from public.admin_customer_overview v
     where v.points_available <> coalesce((select sum(l.points) from public.points_ledger l where l.customer_id = v.id), 0)
        or v.points_available <> (select b.available from public.points_balance(v.id) b)
        or v.claim_bonus_at is distinct from (select l.created_at from public.points_ledger l
                                               where l.customer_id = v.id and l.kind = 'claim_bonus')),
    'the overview disagrees with the Points ledger';

  -- The Points filter: Has points, and No points, split every Customer.
  assert (select array_agg(id order by id) from public.admin_customer_overview where points_available > 0)
         = (select array_agg(customer_id order by customer_id)
              from (select customer_id from public.points_ledger group by customer_id having sum(points) > 0) s),
    'the Has points filter disagrees with the ledger counted by hand';
  assert (select count(*) filter (where points_available > 0) + count(*) filter (where points_available <= 0)
            from public.admin_customer_overview) = (select count(*) from public.customers),
    'Has points and No points do not split every Customer';
  -- The view still has one row per Customer.
  assert (select count(*) from public.admin_customer_overview) = (select count(*) from public.customers),
    'the overview has a row per Customer no longer';
end $$;

-- ---------------------------------------------------------------------
-- The Migration card against migrated_customers, the ledger and orders, by hand
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
    count(*) filter (where exists (select 1 from public.points_ledger l
                                    where l.customer_id = m.customer_id and l.kind = 'claim_bonus')) as bonuses
    into h
    from public.migrated_customers m;
  assert (s.clicked, s.claim_bonuses) = (h.clicked, h.bonuses),
    format('Migration card %s, by hand %s', s, h);
  assert (s.clicked, s.claim_bonuses) = (2::bigint, 2::bigint),
    format('the fixtures should read clicked 2, Claim bonuses 2: %s', s);

  select count(*) as orders, coalesce(sum(o.points_spent), 0) as spent, coalesce(sum(o.total), 0) as revenue into h
    from public.orders o
    join public.migrated_customers m on m.customer_id = o.customer_id
   where o.paid_at is not null
     and o.points_spent > 0;
  assert (s.points_orders, s.migrated_points_spent, s.points_revenue) = (h.orders, h.spent, h.revenue),
    format('Points %s / %s / %s, by hand %s', s.points_orders, s.migrated_points_spent, s.points_revenue, h);
  assert (s.points_orders, s.migrated_points_spent, s.points_revenue) = (1::bigint, 1000::bigint, 100::numeric),
    format('the fixtures should read one paid order, 1,000 points, 100: %s / %s / %s',
           s.points_orders, s.migrated_points_spent, s.points_revenue);

  -- Slice 12's and slice 08's columns are unchanged by the rebuild.
  assert s.imported = (select count(*) from public.migrated_customers), 'imported moved';
  assert s.signed_up = (select count(*) from public.migrated_customers m join public.customers c on c.id = m.customer_id
                         where c.auth_user_id is not null), 'signed_up moved';
  assert (s.emailed, s.emails_bounced, s.emails_complained) = (0::bigint, 0::bigint, 0::bigint),
    format('nothing was emailed here: %s', s);
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
  -- Their Points go with them; the overview and the card follow.
  assert not exists (select 1 from public.points_ledger where customer_id = 'c6000000-0000-4000-8000-000000000002'),
    'a deleted Customer''s points survived';
  assert (select claim_bonuses from public.admin_customer_migration_summary) = 1,
    'the Migration card still counts a deleted Customer''s Claim bonus';
end $$;

select 'slice 06 welcome asserts ok';

rollback;
