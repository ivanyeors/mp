-- The Claim link (PRD-shopify-customer-migration slice 06; ADR 0028 decision 7).
--
-- A Claim link is `/account/welcome?c=<token>` in a campaign email. It
-- prefills the welcome page's sign-in form and attributes the click. It never
-- signs anyone in: proof of the email is always the Sign in itself.
--
-- customer_claim_links: one row per token, one token per email sent. Only the
-- SHA-256 of the token is stored (hex, of the 43-character base64url string of
-- 32 random bytes), so a token cannot be read back out of the database and
-- reused: the announcement and the reminder each mint their own
-- (lib/customer-migration/claim-link.ts, called by the slice 08 sender). Every
-- token stays valid, so an old email still works after a newer one went out.
-- The Assist link stores its code in plaintext (20260912000000) and is meant
-- to be reused; a Claim link is a per-customer capability and must not be.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated.
-- The welcome page reads it with the service role.
--
-- open_claim_link(p_token_hash, p_count) is the welcome page's one call: it
-- records the click and returns whose link it is (the id, first name and email
-- to prefill), or no row for an unknown token. One statement, so two
-- concurrent opens both count. p_count = false is a signed-in visit: it sets
-- the first click if there was none and otherwise changes nothing, so the
-- return trip from signing in (whose `next` is the same URL) is not a second
-- click.
--
-- An email change voids the links. Staff can change a Customer's email
-- (PATCH /api/shop/customers/[id]). For a Customer who has not Claimed, the
-- change deletes their Claim links, so an old email cannot prefill, or claim
-- for, the new address. A trigger does it, so no write path can forget. A
-- Claimed Migrated customer keeps theirs: the email was proven by signing in,
-- and the clicks are the campaign's history.
--
-- A Customer with a Claim link reads as referenced to the import's undo
-- (customer_import_undo_plan reads every foreign key to customers), so an undo
-- after a campaign wave keeps the Customers it emailed, as it keeps any other
-- Customer something points at.
--
-- Idempotent.

create table if not exists public.customer_claim_links (
  id               bigserial primary key,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  -- sha256 (hex) of a 32-byte base64url token; the token itself is never stored.
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Which campaign email carried it (the slice 08 template name).
  template         text not null check (btrim(template) <> ''),
  created_at       timestamptz not null default now(),
  first_clicked_at timestamptz null,
  last_clicked_at  timestamptz null,
  click_count      int not null default 0 check (click_count >= 0)
);

create index if not exists customer_claim_links_customer_id_idx
  on public.customer_claim_links (customer_id);

alter table public.customer_claim_links enable row level security;
revoke all on public.customer_claim_links from anon, authenticated;
revoke all on sequence public.customer_claim_links_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- Minting a link: one row per email sent, the hash only
-- ---------------------------------------------------------------------
-- The slice 08 sender calls this through mintClaimLink, with the hash of a
-- token it generated; the plaintext goes only into that email.
create or replace function public.mint_claim_link(p_customer_id uuid, p_token_hash text, p_template text)
returns void
language sql
volatile
set search_path = public
as $$
  insert into customer_claim_links (customer_id, token_hash, template)
  values (p_customer_id, p_token_hash, p_template);
$$;

revoke execute on function public.mint_claim_link(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mint_claim_link(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Opening a link: record the click, and say whose it is
-- ---------------------------------------------------------------------
create or replace function public.open_claim_link(p_token_hash text, p_count boolean default true)
returns table (customer_id uuid, first_name text, email text)
language sql
volatile
set search_path = public
as $$
  with opened as (
    update customer_claim_links l
       set first_clicked_at = coalesce(l.first_clicked_at, now()),
           last_clicked_at  = case when p_count or l.first_clicked_at is null
                                   then now() else l.last_clicked_at end,
           click_count      = l.click_count
                              + case when p_count or l.first_clicked_at is null then 1 else 0 end
     where l.token_hash = p_token_hash
    returning l.customer_id
  )
  select c.id, c.first_name, c.email
    from opened o
    join customers c on c.id = o.customer_id;
$$;

revoke execute on function public.open_claim_link(text, boolean) from public, anon, authenticated;
grant execute on function public.open_claim_link(text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- An email change voids the links of a Customer who has not Claimed
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: both tables it reads and writes are service-role only, and
-- the voiding must happen whoever is allowed to change the email.
create or replace function public.customers_void_claim_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) is distinct from lower(old.email)
     and not exists (
       select 1 from migrated_customers m
        where m.customer_id = new.id and m.claimed_at is not null
     )
  then
    delete from customer_claim_links where customer_id = new.id;
  end if;
  return null;
end;
$$;

revoke execute on function public.customers_void_claim_links() from public, anon, authenticated;

drop trigger if exists trg_customers_void_claim_links on public.customers;
create trigger trg_customers_void_claim_links
after update of email on public.customers
for each row execute function public.customers_void_claim_links();
