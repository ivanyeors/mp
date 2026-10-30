-- Shop reviews: our public reply, written from Telegram.
--
-- A Staff member replies to a Shop review's Telegram card with the words to
-- show; they appear under the review on the product page while the review is
-- approved (lib/reviews/shop-reviews.ts, lib/reviews/telegram-handler.ts).
--
--   store_reply          the reply as shown on the product page; null = none
--   store_reply_at       when it was last set; set exactly when store_reply is
--   store_reply_by_name  the Staff profile who set it. For the card only, never public
--   telegram_chat_id,
--   telegram_message_id  the review's card in the measurements group, so a reply
--                        to the card finds its review (as on google_reviews)
--
-- The table becomes server-only, like google_reviews. "Public read approved
-- reviews" (0028) let anyone holding the anon key read every column of an
-- approved review over PostgREST: customer_id and order_id, and from here the
-- replier's name and the card ids. The storefront reads reviews only through
-- GET /api/shop/reviews, which lists its public columns. Every reader and
-- writer is server code on the service role (checked 2026-10-30):
-- app/api/shop/reviews and its [id] route, lib/reviews/shop-reviews.ts,
-- lib/seo/review-aggregate.ts, lib/seo/topic-reviews-loader.ts,
-- lib/crm/timeline/sources/reviews.ts, lib/crm/google-review-match-server.ts,
-- and the server-only admin_customer_overview view and
-- customer_lifecycle_* functions. So the policy is dropped and the client
-- grants revoked; the service role bypasses RLS and keeps its grant.
--
-- Safe for the code deployed before it: that code reads and writes with the
-- service role and never names the new columns. Idempotent.

alter table public.product_reviews
  add column if not exists store_reply         text,
  add column if not exists store_reply_at      timestamptz,
  add column if not exists store_reply_by_name text,
  add column if not exists telegram_chat_id    bigint,
  add column if not exists telegram_message_id bigint;

alter table public.product_reviews drop constraint if exists product_reviews_store_reply_check;
alter table public.product_reviews add constraint product_reviews_store_reply_check
  check (
    (store_reply is null and store_reply_at is null)
    or (btrim(store_reply) <> '' and store_reply_at is not null)
  );

create index if not exists idx_product_reviews_card
  on public.product_reviews (telegram_chat_id, telegram_message_id)
  where telegram_message_id is not null;

drop policy if exists "Public read approved reviews" on public.product_reviews;
revoke all on public.product_reviews from anon, authenticated;
