-- Review requests (PRD-customer-crm slice 07, ADR 0028 f, g, k): one message
-- per Customer, ever, 14 days after an Order is delivered, asking for a Google
-- review.
--
-- customer_review_requests is the once-per-Customer guard. Its primary key is
-- the Customer, and the daily job (lib/aftercare/review-request-server.ts)
-- claims the row with INSERT … ON CONFLICT DO NOTHING before anything is sent,
-- so two concurrent runs cannot both ask the same person. The sends themselves
-- are recorded in the two existing ledgers, under template
-- `aftercare.review_request` with entity_id = customer_id:
--   - email in customer_emails (20261020112000), retried while attempts < 3;
--   - WhatsApp in customer_whatsapp (20261020114000), never retried.
--
-- token_hash is the sha256 of the link token both channels carry, so a click
-- on /r/review?t=… is recorded without the token itself being stored.
-- record_review_request_click() counts every click and stamps the first, in
-- one statement. A click is a hint, never proof of a review: mail scanners
-- prefetch links (slice 12 treats it that way).
--
-- Nothing about how the customer feels is stored or read here (README, sixth
-- hazard): no rating, no return, no refund request.
--
-- Server-only, like customer_emails: RLS on with no policy, and the client
-- roles hold no grant. The click function is executable by the service role
-- only.
--
-- The settings are site_settings keys (publicly readable, which is fine for
-- these: none describes a customer):
--   review_requests_enabled      'true' | 'false', seeded 'false'
--   review_request_days_after    days after delivery, seeded 14
--   review_request_max_age_days  never later than this, seeded 60
--   google_review_url            https only; the job refuses to send without one
--
-- Idempotent.

create table if not exists public.customer_review_requests (
  customer_id      uuid primary key references public.customers(id) on delete cascade,
  -- The Order the request was about. Kept when the Order goes, so the Customer
  -- is still never asked twice.
  order_id         uuid null references public.orders(id) on delete set null,
  -- sha256 (hex) of the link token, shared by both channels.
  token_hash       text not null unique,
  first_clicked_at timestamptz null,
  click_count      int not null default 0 check (click_count >= 0),
  created_at       timestamptz not null default now()
);

create index if not exists idx_customer_review_requests_created
  on public.customer_review_requests (created_at);
create index if not exists idx_customer_review_requests_clicked
  on public.customer_review_requests (first_clicked_at)
  where first_clicked_at is not null;

alter table public.customer_review_requests enable row level security;
revoke all on public.customer_review_requests from anon, authenticated;

-- The job's candidate scan: Orders delivered in a window of days.
create index if not exists idx_orders_delivered_at
  on public.orders (delivered_at)
  where delivered_at is not null;

-- One click on a review link. Returns whether the token matched a request.
-- An unknown token changes nothing and returns false; the redirect sends the
-- visitor on to Google either way, so the answer is never shown.
create or replace function public.record_review_request_click(p_token_hash text)
returns boolean
language sql
volatile
security invoker
set search_path = public
as $$
  with hit as (
    update customer_review_requests
       set click_count = click_count + 1,
           first_clicked_at = coalesce(first_clicked_at, now())
     where token_hash = p_token_hash
    returning 1
  )
  select exists (select 1 from hit);
$$;

revoke execute on function public.record_review_request_click(text) from public, anon, authenticated;
grant execute on function public.record_review_request_click(text) to service_role;

insert into public.site_settings (key, value) values
  ('review_requests_enabled', 'false'),
  ('review_request_days_after', '14'),
  ('review_request_max_age_days', '60'),
  ('google_review_url', 'https://g.page/r/CfdGhvgB1hwUEBM/review')
on conflict (key) do nothing;
