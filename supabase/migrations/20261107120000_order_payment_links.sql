-- Payment links for Staff orders (ADR 0048, PRD staff-orders-payment-links).
--
-- A Staff order is a pending Order Staff build on a Customer's page. The
-- customer pays it through our own link, /{lang}/pay/{token}, which opens a
-- fresh Stripe Checkout Session for the Order's stored total each time. This
-- table holds that link: one per Order, and its row is also how a reader tells
-- a Staff order from a shop order.
--
-- `token` is a bearer capability: whoever holds it may see the order's lines
-- and total and pay it, nothing else. Server-only, like order_shipments: the
-- customer's own key reads `orders`, never this.
--
-- `expires_at` is when the link stops working (7 days, renewed by a resend);
-- the daily job cancels a Staff order still unpaid after it. `created_by` is
-- the Staff member's auth user id, as the Audit Log records actors.
--
-- DEPLOY ORDER: apply before the code. Idempotent.

create table if not exists public.order_payment_links (
  order_id          uuid primary key references public.orders(id) on delete cascade,
  token             uuid not null default gen_random_uuid(),
  expires_at        timestamptz not null,
  created_by        uuid,
  created_by_email  text,
  last_sent_at      timestamptz,
  last_sent_to      text,
  send_count        integer not null default 0 check (send_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists idx_order_payment_links_token
  on public.order_payment_links(token);

-- The expiry sweep reads unexpired-yesterday rows.
create index if not exists idx_order_payment_links_expires
  on public.order_payment_links(expires_at);

drop trigger if exists trg_order_payment_links_updated_at on public.order_payment_links;
create trigger trg_order_payment_links_updated_at
before update on public.order_payment_links
for each row execute procedure set_updated_at();

alter table public.order_payment_links enable row level security;
revoke all on public.order_payment_links from anon, authenticated;

comment on table public.order_payment_links is
  'Payment link of a Staff order (ADR 0048): its token, expiry and sends. Service role only.';
