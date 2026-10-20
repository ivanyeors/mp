-- The Claim, and the account-bound Welcome-back voucher
-- (PRD-shopify-customer-migration slice 05; ADR 0028 f, g).
--
-- coupons.customer_id binds a coupon to one Customer. validateCoupon accepts a
-- bound coupon only for that Customer, signed in and checking out with their
-- own email (lib/ecommerce/discounts.ts). A coupon with customer_id null is a
-- bearer code, exactly as before. coupons stays service-role only: its one
-- policy was scoped to service_role in 20260902000000, and checkout and the
-- preview read it through the service role, so the new columns need no grant.
--
-- coupons.issued_for names why the platform issued it. The unique index allows
-- one Welcome-back voucher per Customer; it is the race guard behind the Claim.
--
-- The voucher terms are site_settings keys. Owner decision 2 (value, minimum
-- spend, expiry and the date issuance stops) is still open, so issuance ships
-- off: `welcome_voucher_enabled` is seeded 'false', and a voucher is issued
-- only when it is 'true' AND the type, the value (for a fixed amount) and
-- `welcome_voucher_issue_until` are all set and valid. Nothing here guesses a
-- value. The Admin Panel card that edits them is slice 06's.
--
--   welcome_voucher_enabled      'true' | 'false'
--   welcome_voucher_type         'fixed_amount' | 'free_shipping'
--   welcome_voucher_value        SGD off, for fixed_amount
--   welcome_voucher_min_order    SGD; blank means no minimum
--   welcome_voucher_valid_days   days from the Claim, default 60
--   welcome_voucher_issue_until  YYYY-MM-DD, the last day (Singapore) a Claim issues one
--
-- site_settings is publicly readable (20260308000000), which is fine for terms
-- that are advertised anyway. The function reads them itself at issuance; no
-- copy from a client is ever trusted.
--
-- claim_migrated_customer(p_customer_id) runs the Claim in one transaction:
--   1. stamps migrated_customers.claimed_at, once. A concurrent second call
--      waits on the row lock, then matches nothing.
--   2. at that moment only, issues the voucher if the terms allow it.
--   3. reports whether the welcome_voucher email is due: a usable voucher whose
--      email is not sent, not in flight, and has attempts left. That is how a
--      failed send is retried on a later sign-in, with no cron.
-- For a Customer who is not a Migrated customer, or is already Claimed, step 1
-- is one indexed update that matches nothing, and nothing is written.
-- linkCustomerToAuthUser calls it on every sign-in (lib/customer-migration/claim.ts).
--
-- SECURITY DEFINER, so executable by the service role only (as in
-- 20260917033807).
--
-- Idempotent.

alter table public.coupons
  add column if not exists customer_id uuid null references public.customers(id) on delete cascade,
  add column if not exists issued_for text null check (issued_for in ('welcome_back'));

-- A coupon the platform issued for a purpose is always bound to a Customer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.coupons'::regclass and conname = 'coupons_issued_for_bound'
  ) then
    alter table public.coupons
      add constraint coupons_issued_for_bound check (issued_for is null or customer_id is not null);
  end if;
end $$;

create unique index if not exists coupons_one_per_customer_purpose
  on public.coupons (customer_id, issued_for)
  where customer_id is not null and issued_for is not null;

-- The foreign key's own index, for the cascade from customers.
create index if not exists idx_coupons_customer
  on public.coupons (customer_id) where customer_id is not null;

insert into public.site_settings (key, value) values
  ('welcome_voucher_enabled', 'false'),
  ('welcome_voucher_valid_days', '60')
on conflict (key) do nothing;

create or replace function public.claim_migrated_customer(p_customer_id uuid)
returns table (claimed boolean, voucher_issued boolean, welcome_email_due boolean)
language plpgsql
volatile
security definer
-- `extensions` for gen_random_bytes: pgcrypto lives there on Supabase.
set search_path = public, extensions
as $$
declare
  v_claimed boolean := false;
  v_issued  boolean := false;
  v_due     boolean := false;
  s         record;
  v_type    text;
  v_value   numeric;
  v_min     numeric;
  v_days    int;
  v_until   date;
  v_bytes   bytea;
  v_code    text := 'WB-';
  -- Base32 without look-alikes: no 0/O, no 1/I.
  c_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  update migrated_customers
     set claimed_at = now()
   where customer_id = p_customer_id
     and claimed_at is null;
  v_claimed := found;

  if v_claimed then
    select
      max(value) filter (where key = 'welcome_voucher_enabled')     as enabled,
      max(value) filter (where key = 'welcome_voucher_type')        as type,
      max(value) filter (where key = 'welcome_voucher_value')       as value,
      max(value) filter (where key = 'welcome_voucher_min_order')   as min_order,
      max(value) filter (where key = 'welcome_voucher_valid_days')  as valid_days,
      max(value) filter (where key = 'welcome_voucher_issue_until') as issue_until
      into s
      from site_settings
     where key like 'welcome\_voucher\_%';

    if lower(btrim(coalesce(s.enabled, ''))) = 'true' then
      begin
        v_type  := btrim(coalesce(s.type, ''));
        v_value := nullif(btrim(coalesce(s.value, '')), '')::numeric;
        v_min   := nullif(btrim(coalesce(s.min_order, '')), '')::numeric;
        v_days  := coalesce(nullif(btrim(coalesce(s.valid_days, '')), '')::int, 60);
        v_until := nullif(btrim(coalesce(s.issue_until, '')), '')::date;
      exception when others then
        -- A malformed term issues nothing rather than a guessed voucher.
        raise warning 'claim_migrated_customer: welcome voucher terms are not valid (%)', sqlerrm;
        v_type := null;
      end;

      if v_type in ('fixed_amount', 'free_shipping')
         and (v_type = 'free_shipping' or v_value > 0)
         and (v_min is null or v_min >= 0)
         and v_days between 1 and 3650
         and v_until is not null
         and (now() at time zone 'Asia/Singapore')::date <= v_until
      then
        -- 10 bytes, 5 bits each: 256 is a multiple of 32, so every character
        -- is equally likely. 50 bits, and the code is useless to anyone else.
        v_bytes := gen_random_bytes(10);
        for i in 0..9 loop
          v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
        end loop;

        -- The conflict target is the one-per-purpose index only: a code
        -- collision raises and rolls the Claim back, so the next sign-in
        -- claims again, rather than stamping a Claim with no voucher.
        insert into coupons (
          code, discount_type, discount_value, min_order_amount,
          usage_limit, per_customer_limit, expires_at, customer_id, issued_for
        ) values (
          v_code,
          v_type::discount_type,
          -- The CHECK wants > 0; free shipping ignores the value
          -- (computeCouponDiscountAmount).
          case when v_type = 'fixed_amount' then round(v_value, 2) else 1 end,
          round(v_min, 2),
          1, 1,
          now() + make_interval(days => v_days),
          p_customer_id,
          'welcome_back'
        )
        on conflict (customer_id, issued_for)
          where customer_id is not null and issued_for is not null
          do nothing;
        v_issued := found;
      end if;
    end if;
  end if;

  -- 'account.welcome_voucher' is WELCOME_VOUCHER_EMAIL in
  -- lib/customer-migration/claim.ts; 3 is CUSTOMER_EMAIL_MAX_ATTEMPTS.
  select exists (
           select 1 from coupons c
            where c.customer_id = p_customer_id
              and c.issued_for = 'welcome_back'
              and c.is_active
              and (c.expires_at is null or c.expires_at > now())
              and (c.usage_limit is null or c.usage_count < c.usage_limit))
     and not exists (
           select 1 from customer_emails e
            where e.customer_id = p_customer_id
              and e.template = 'account.welcome_voucher'
              and e.entity_id = p_customer_id
              and (e.status <> 'failed' or e.attempts >= 3))
    into v_due;

  return query select v_claimed, v_issued, v_due;
end;
$$;

revoke execute on function public.claim_migrated_customer(uuid) from public, anon, authenticated;
grant execute on function public.claim_migrated_customer(uuid) to service_role;
