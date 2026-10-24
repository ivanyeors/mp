-- Loyalty points: the Claim bonus replaces the Welcome-back voucher at the
-- Claim (PRD-loyalty-points slice 05; ADR 0030 rules f, g; ADR 0029 (g),
-- amended 2026-10-21).
--
-- claim_bonus_window_end(): when a Customer's window to earn the bonus by
-- claiming closes. 3 months (points_claim_bonus_months) after the first
-- campaign email we sent them; for a Customer we never emailed, after the
-- first campaign email we sent anyone; null (still open) before any campaign
-- email has gone out. There is no calendar date to set: the clocks are facts
-- customer_campaign_sends already stores. "Sent" means the provider took it:
-- sent, bounced or complained.
--
-- grant_claim_bonus(): inserts the one `claim_bonus` entry when every
-- condition holds: points on and the bonus above 0; a Migrated customer with
-- `claimed_at` inside their window (or the window still open); not a partner
-- (rule r); no bonus yet. points_ledger_one_claim_bonus makes it race-safe.
-- It does not depend on the call being the one that stamped `claimed_at`, and
-- that is the backfill (rule g): someone who claimed while points were off is
-- granted at their next sign-in, if their Claim fell inside the window.
--
-- claim_migrated_customer() keeps its Claim exactly as before (one indexed
-- update that stamps `claimed_at` once), then grants the bonus. The voucher
-- insert is gone. It now returns (claimed, bonus_granted, bonus_email_due);
-- the email is 'account.claim_bonus' (CLAIM_BONUS_EMAIL in
-- lib/customer-migration/claim.ts), sent once through customer_emails.
--
-- Server-only, as before. Idempotent.

create or replace function public.claim_bonus_window_end(p_customer_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with s as (select claim_bonus_months as months from points_settings()),
  own as (
    select min(sent_at) as at from customer_campaign_sends
     where customer_id = p_customer_id and status in ('sent', 'bounced', 'complained')
  ),
  first_wave as (
    select min(sent_at) as at from customer_campaign_sends where status in ('sent', 'bounced', 'complained')
  )
  select coalesce(own.at, first_wave.at) + make_interval(months => s.months)
    from s, own, first_wave;
$$;

revoke execute on function public.claim_bonus_window_end(uuid) from public, anon, authenticated;
grant execute on function public.claim_bonus_window_end(uuid) to service_role;

create or replace function public.grant_claim_bonus(p_customer_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s          record;
  v_claimed  timestamptz;
  v_end      timestamptz;
  v_id       uuid;
begin
  select * into s from points_settings();
  if not s.enabled or s.claim_bonus <= 0 then
    return false;
  end if;

  select claimed_at into v_claimed from migrated_customers where customer_id = p_customer_id;
  if v_claimed is null then
    return false;
  end if;
  -- One index probe for everyone already granted: the usual sign-in.
  if exists (select 1 from points_ledger where customer_id = p_customer_id and kind = 'claim_bonus') then
    return false;
  end if;

  v_end := claim_bonus_window_end(p_customer_id);
  if v_end is not null and v_claimed > v_end then
    return false;
  end if;
  if is_partner_customer(p_customer_id) then
    return false;
  end if;

  insert into points_ledger (customer_id, kind, points, note)
  values (p_customer_id, 'claim_bonus', s.claim_bonus, 'Claim bonus')
  on conflict (customer_id) where kind = 'claim_bonus' do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke execute on function public.grant_claim_bonus(uuid) from public, anon, authenticated;
grant execute on function public.grant_claim_bonus(uuid) to service_role;

-- The return type changes, so the function is replaced, not redefined.
drop function if exists public.claim_migrated_customer(uuid);

create function public.claim_migrated_customer(p_customer_id uuid)
returns table (claimed boolean, bonus_granted boolean, bonus_email_due boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
  v_granted boolean := false;
  v_due     boolean := false;
begin
  update migrated_customers
     set claimed_at = now()
   where customer_id = p_customer_id
     and claimed_at is null;
  v_claimed := found;

  v_granted := grant_claim_bonus(p_customer_id);

  -- 'account.claim_bonus' is CLAIM_BONUS_EMAIL in
  -- lib/customer-migration/claim.ts; 3 is CUSTOMER_EMAIL_MAX_ATTEMPTS. Due
  -- while the bonus exists and its email is unsent, not in flight, and has
  -- attempts left.
  select exists (
           select 1 from points_ledger l
            where l.customer_id = p_customer_id and l.kind = 'claim_bonus')
     and not exists (
           select 1 from customer_emails e
            where e.customer_id = p_customer_id
              and e.template = 'account.claim_bonus'
              and e.entity_id = p_customer_id
              and (e.status <> 'failed' or e.attempts >= 3))
    into v_due;

  return query select v_claimed, v_granted, v_due;
end;
$$;

revoke execute on function public.claim_migrated_customer(uuid) from public, anon, authenticated;
grant execute on function public.claim_migrated_customer(uuid) to service_role;
