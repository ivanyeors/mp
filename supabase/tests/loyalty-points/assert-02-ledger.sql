-- Loyalty points slice 02 (PRD-loyalty-points; ADR 0030): the ledger, the
-- partner rule, the candidates, the balance, Staff adjustments and the cost
-- summary, asserted against real Postgres
-- (20261021120000_points_ledger.sql), as points-never-expire left them
-- (20261031032017_points_never_expire.sql).
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `points slice 02 ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/loyalty-points/assert-02-ledger.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS02-%';
delete from customers where email like '%@assertpts.test';
delete from partner_users where email ilike '%@assertpts.test' or backup_email ilike '%@assertpts.test' or btrim(email) ilike '%@x.test' or btrim(backup_email) ilike '%@x.test';
delete from site_settings where key = 'points_launch_at';
update site_settings set value = '3' where key = 'points_earn_per_dollar';

-- ---------------------------------------------------------------- structure
do $$
declare
  f text;
  v text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.points_ledger'::regclass), 'ledger: RLS on';
  assert not exists (select 1 from pg_policies where tablename = 'points_ledger'), 'ledger: no policy';
  foreach f in array array['select', 'insert', 'update', 'delete'] loop
    assert not has_table_privilege('anon', 'public.points_ledger', f), 'ledger: anon ' || f;
    assert not has_table_privilege('authenticated', 'public.points_ledger', f), 'ledger: authenticated ' || f;
  end loop;
  foreach v in array array['public.points_order_candidates', 'public.admin_points_summary'] loop
    assert not has_table_privilege('anon', v, 'select'), v || ': no anon';
    assert not has_table_privilege('authenticated', v, 'select'), v || ': server-only';
  end loop;
  foreach f in array array[
    'public.points_settings()',
    'public.is_partner_customer(uuid)',
    'public.points_balance(uuid)',
    'public.adjust_points(uuid, integer, text, uuid)'
  ] loop
    assert not has_function_privilege('anon', f, 'execute'), 'anon executes ' || f;
    assert not has_function_privilege('authenticated', f, 'execute'), 'authenticated executes ' || f;
    assert has_function_privilege('service_role', f, 'execute'), 'service_role cannot execute ' || f;
  end loop;

  -- Every default seeded, off, and no launch date.
  assert (select enabled = false and launch_at is null and earn_per_dollar = 3 and min_redeem = 500
            and max_share = 0.5 and claim_bonus = 1000 and claim_bonus_months = 3
            from points_settings()), 'settings: the PRD defaults';

  -- Points never expire: no setting, no expiry function, no date on the balance.
  assert not exists (select 1 from site_settings where key = 'points_expiry_months'), 'settings: no expiry';
  assert not exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in ('expire_points', 'expire_due_points', 'points_expiry_reminder_candidates', 'points_clock', 'points_expires_on')
  ), 'no expiry functions';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
           where attrelid = 'public.admin_points_summary'::regclass and attname like 'expired%') is null, 'summary: no expired columns';
  assert (select string_agg(a, ',') from unnest((select proargnames from pg_proc where oid = 'public.points_balance(uuid)'::regprocedure)) a)
         = 'p_customer_id,available,pending', 'balance: available and pending only';
end $$;

-- ---------------------------------------------------------------- fixtures
insert into customers (id, email, first_name) values
  ('0f0f0f0f-0000-4000-8000-000000000001', 'ann@assertpts.test', 'Ann'),
  ('0f0f0f0f-0000-4000-8000-000000000002', 'Pat.Partner@assertpts.test', 'Pat'),
  ('0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'Bo'),
  ('0f0f0f0f-0000-4000-8000-000000000004', 'pending@assertpts.test', 'Pen'),
  ('0f0f0f0f-0000-4000-8000-000000000005', 'backup@assertpts.test', 'Bak');
insert into partner_users (email, application_status) values ('pat.partner@ASSERTPTS.test', 'approved');
insert into partner_users (email, application_status) values ('pending@assertpts.test', 'pending');
insert into partner_users (email, application_status, backup_email, backup_email_verified)
values ('main@assertpts.test', 'approved', 'backup@assertpts.test', true);

-- ---------------------------------------------------------------- append-only and signs
do $$
declare
  v_id uuid;
begin
  insert into points_ledger (customer_id, kind, points, note)
  values ('0f0f0f0f-0000-4000-8000-000000000001', 'adjust', 10, 'test') returning id into v_id;
  begin
    update points_ledger set points = 20 where id = v_id;
    assert false, 'an update is refused';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from points_ledger where id = v_id;
    assert false, 'a delete is refused';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'spend', 5);
    assert false, 'a spend is negative';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'earn', -5);
    assert false, 'an earn is positive';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'expire', -5);
    assert false, 'there is no expire kind';
  exception when check_violation then null;
  end;
  begin
    insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'adjust', 5);
    assert false, 'an adjustment needs a note';
  exception when check_violation then null;
  end;
  insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'claim_bonus', 1000);
  begin
    insert into points_ledger (customer_id, kind, points) values ('0f0f0f0f-0000-4000-8000-000000000001', 'claim_bonus', 1000);
    assert false, 'one Claim bonus per Customer';
  exception when unique_violation then null;
  end;
end $$;

-- The service role is no exception.
set role service_role;
do $$
begin
  begin
    delete from points_ledger where customer_id = '0f0f0f0f-0000-4000-8000-000000000001';
    assert false, 'the service role cannot delete';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- partners (rule r)
do $$
begin
  assert not is_partner_customer('0f0f0f0f-0000-4000-8000-000000000001'), 'Ann is a customer';
  assert is_partner_customer('0f0f0f0f-0000-4000-8000-000000000002'), 'Pat matches by email, any case';
  assert not is_partner_customer('0f0f0f0f-0000-4000-8000-000000000004'), 'a pending application is not a partner';
  assert is_partner_customer('0f0f0f0f-0000-4000-8000-000000000005'), 'a verified backup email matches';
  update partner_users set backup_email_verified = false where email = 'main@assertpts.test';
  assert not is_partner_customer('0f0f0f0f-0000-4000-8000-000000000005'), 'an unverified backup email does not';
  assert not is_partner_customer('0f0f0f0f-0000-4000-8000-0000000000ff'), 'no such Customer';
end $$;

-- ------------------------------------------------- partner-cases.json (parity with isPartnerMatch)
\set partner_cases `cat supabase/tests/loyalty-points/partner-cases.json`
create temp table t_partner_cases as select (:'partner_cases')::jsonb as doc;

do $$
declare
  c        jsonb;
  i        int := 0;
  v_cust   uuid;
  v_auth   uuid;
  v_got    boolean;
  failures text := '';
begin
  for c in select value from jsonb_array_elements((select doc from t_partner_cases)->'cases') loop
    i := i + 1;
    v_cust := ('0f0f0f0f-2000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    v_auth := ('0f0f0f0f-3000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    delete from partner_users where btrim(email) ilike '%@x.test' or btrim(backup_email) ilike '%@x.test';
    delete from customers where id = v_cust;
    if (c->'customer'->>'signedUp')::boolean then
      insert into auth.users (id, email) values (v_auth, 'case' || i || '@auth.assertpts.test') on conflict (id) do nothing;
    end if;
    insert into customers (id, email, auth_user_id)
    values (v_cust, c->'customer'->>'email', case when (c->'customer'->>'signedUp')::boolean then v_auth end);
    if c->'partner' <> 'null'::jsonb then
      insert into partner_users (auth_user_id, email, application_status, backup_email, backup_email_verified)
      values (case when (c->'partner'->>'login')::boolean then v_auth end,
              c->'partner'->>'email', c->'partner'->>'status',
              c->'partner'->>'backup', coalesce((c->'partner'->>'backupVerified')::boolean, false));
    end if;
    v_got := is_partner_customer(v_cust);
    if v_got is distinct from (c->>'expected')::boolean then
      failures := failures || format(E'\n  %s: expected %s, got %s', c->>'name', c->>'expected', v_got);
    end if;
    delete from partner_users where btrim(email) ilike '%@x.test' or btrim(backup_email) ilike '%@x.test';
    delete from customers where id = v_cust;
    delete from auth.users where id = v_auth;
  end loop;
  assert i >= 9, 'every partner case ran: ' || i;
  assert failures = '', 'is_partner_customer disagrees with partner-cases.json:' || failures;
end $$;

-- ---------------------------------------------------------------- adjustments (rule n)
do $$
declare
  v integer;
begin
  -- Ann holds 10 (adjust) + 1000 (claim bonus) from above.
  v := adjust_points('0f0f0f0f-0000-4000-8000-000000000001', 500, 'Goodwill for a late delivery', null);
  assert v = 1510, 'adjust: returns the new balance, ' || v;
  begin
    perform adjust_points('0f0f0f0f-0000-4000-8000-000000000001', -1511, 'too much', null);
    assert false, 'adjust: never below zero';
  exception when check_violation then null;
  end;
  begin
    perform adjust_points('0f0f0f0f-0000-4000-8000-000000000001', 5, '   ', null);
    assert false, 'adjust: a reason is required';
  exception when check_violation then null;
  end;
  begin
    perform adjust_points('0f0f0f0f-0000-4000-8000-000000000001', 0, 'nothing', null);
    assert false, 'adjust: not zero';
  exception when check_violation then null;
  end;
  begin
    perform adjust_points('0f0f0f0f-0000-4000-8000-000000000002', 100, 'partner', null);
    assert false, 'adjust: never for a partner';
  exception when check_violation then null;
  end;
  begin
    perform adjust_points('0f0f0f0f-0000-4000-8000-0000000000ff', 100, 'nobody', null);
    assert false, 'adjust: no such Customer';
  exception when no_data_found then null;
  end;
  v := adjust_points('0f0f0f0f-0000-4000-8000-000000000001', -1510, 'Back to zero', null);
  assert v = 0, 'adjust: down to exactly zero';
end $$;

-- ---------------------------------------------------------------- candidates and the balance
insert into site_settings (key, value) values ('points_launch_at', '2026-10-01T00:00:00+08:00')
on conflict (key) do update set value = excluded.value;

insert into orders (id, order_number, customer_id, email, status, currency, subtotal, discount_amount, total, shipping_address, paid_at, delivered_at, amount_refunded, self_purchase_partner_id) values
  -- Delivered 10 days ago: pending, released 20 days from now. 3 × (200 − 20 − 0) = 540.
  ('0f0f0f0f-1000-4000-8000-000000000001', 'PTS02-1', '0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'delivered', 'SGD', 200, 20, 192, '{}', now() - interval '12 days', now() - interval '10 days', 0, null),
  -- Not yet delivered: pending with no date. 3 × (100 − 0 − 30 refunded) = 210.
  ('0f0f0f0f-1000-4000-8000-000000000002', 'PTS02-2', '0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'processing', 'SGD', 100, 0, 100, '{}', now() - interval '2 days', null, 30, null),
  -- Paid before launch: never earns.
  ('0f0f0f0f-1000-4000-8000-000000000003', 'PTS02-3', '0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'delivered', 'SGD', 500, 0, 500, '{}', '2026-09-20T00:00:00+08:00', '2026-09-25T00:00:00+08:00', 0, null),
  -- Cancelled: never earns.
  ('0f0f0f0f-1000-4000-8000-000000000004', 'PTS02-4', '0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'cancelled', 'SGD', 80, 0, 80, '{}', now() - interval '3 days', null, 0, null),
  -- A partner Customer's Order: never earns.
  ('0f0f0f0f-1000-4000-8000-000000000005', 'PTS02-5', '0f0f0f0f-0000-4000-8000-000000000002', 'Pat.Partner@assertpts.test', 'delivered', 'SGD', 300, 0, 300, '{}', now() - interval '40 days', now() - interval '35 days', 0, null),
  -- Fully refunded: base 0, earns nothing.
  ('0f0f0f0f-1000-4000-8000-000000000006', 'PTS02-6', '0f0f0f0f-0000-4000-8000-000000000003', 'bo@assertpts.test', 'refunded', 'SGD', 60, 0, 60, '{}', now() - interval '5 days', null, 60, null);
insert into order_items (order_id, sku, product_title, quantity, unit_price, total_price, kind, service_key) values
  ('0f0f0f0f-1000-4000-8000-000000000001', 'SKU-1', 'Pillow', 1, 200, 200, 'goods', null),
  ('0f0f0f0f-1000-4000-8000-000000000002', 'SKU-2', 'Case', 1, 100, 100, 'goods', null);

do $$
declare
  b record;
  v_self uuid;
begin
  assert (select count(*) from points_order_candidates where order_number like 'PTS02-%') = 2,
    'candidates: only the two earning Orders, ' || (select count(*) from points_order_candidates where order_number like 'PTS02-%');
  assert (select points = 540 and release_at = delivered_at + interval '30 days'
            from points_order_candidates where order_number = 'PTS02-1'), 'candidates: delivered, 540, 30 days on';
  assert (select points = 210 and release_at is null
            from points_order_candidates where order_number = 'PTS02-2'), 'candidates: undelivered, refund taken off, no date';

  select * into b from points_balance('0f0f0f0f-0000-4000-8000-000000000003');
  assert b.available = 0 and b.pending = 750, 'balance: nothing available, 750 pending';

  -- An earned entry moves an Order out of the candidates.
  insert into points_ledger (customer_id, kind, points, order_id)
  values ('0f0f0f0f-0000-4000-8000-000000000003', 'earn', 540, '0f0f0f0f-1000-4000-8000-000000000001');
  select * into b from points_balance('0f0f0f0f-0000-4000-8000-000000000003');
  assert b.available = 540 and b.pending = 210, 'balance: earned moves from pending to available';

  -- A partner's self-purchase never earns.
  select id into v_self from partners limit 1;
  if v_self is not null then
    update orders set self_purchase_partner_id = v_self where order_number = 'PTS02-2';
    assert not exists (select 1 from points_order_candidates where order_number = 'PTS02-2'),
      'candidates: a self-purchase never earns';
    update orders set self_purchase_partner_id = null where order_number = 'PTS02-2';
  end if;

  -- The earn rate is a setting.
  update site_settings set value = '1' where key = 'points_earn_per_dollar';
  assert (select points from points_order_candidates where order_number = 'PTS02-2') = 70, 'candidates: the rate is read';
  update site_settings set value = '3' where key = 'points_earn_per_dollar';

  -- Not launched: nothing pending.
  delete from site_settings where key = 'points_launch_at';
  assert not exists (select 1 from points_order_candidates where order_number like 'PTS02-%'), 'candidates: none before launch';
end $$;

-- ---------------------------------------------------------------- the summary
do $$
begin
  assert (select outstanding_points >= 540 and claim_bonuses >= 1 from admin_points_summary), 'summary: outstanding and bonuses';
end $$;

-- ---------------------------------------------------------------- cleanup
delete from orders where order_number like 'PTS02-%';
delete from customers where email like '%@assertpts.test';
delete from partner_users where email ilike '%@assertpts.test' or backup_email ilike '%@assertpts.test';
delete from site_settings where key = 'points_launch_at';

select 'points slice 02 ok';
