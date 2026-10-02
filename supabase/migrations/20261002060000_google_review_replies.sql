-- Google review replies through Telegram (PRD-google-review-replies).
--
-- telegram_operators: who may act on review cards in the measurements Telegram
--   group (MP_CONFIG_TELEGRAM_CHAT_ID). The Telegram user id on every update is
--   the identity. An admin creates the row under Staff Management → Telegram
--   access and hands the person a one-time link code; `/link CODE` to the bot
--   binds their Telegram user id. Only the code's sha256 is stored.
--
-- google_reviews: one row per Google Business Profile review, keyed by its
--   resource name (accounts/{a}/locations/{l}/reviews/{r}). Holds Claude's
--   draft, the Telegram card it was posted as, and what was finally sent to
--   Google. Shop reviews stay in product_reviews; only Google gets replies.
--
-- Server-only: every reader and writer is server code using the service role,
-- which bypasses RLS. RLS on with no policies, client grants revoked.

create table if not exists telegram_operators (
  id                   uuid primary key default gen_random_uuid(),
  display_name         text not null check (char_length(display_name) between 1 and 80),
  role                 text not null check (role in ('review_manager', 'shop_moderator')),
  is_active            boolean not null default true,
  telegram_user_id     bigint unique,
  telegram_username    text,
  linked_at            timestamptz,
  link_code_hash       text unique,
  link_code_expires_at timestamptz,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_telegram_operators_updated_at on telegram_operators;
create trigger trg_telegram_operators_updated_at
before update on telegram_operators
for each row execute procedure set_updated_at();

alter table telegram_operators enable row level security;
revoke all on public.telegram_operators from anon, authenticated;

create table if not exists google_reviews (
  id                        uuid primary key default gen_random_uuid(),
  review_name               text not null unique,
  star_rating               smallint check (star_rating between 1 and 5),
  comment                   text,
  reviewer_name             text,
  reviewer_is_anonymous     boolean not null default false,
  review_created_at         timestamptz,
  review_updated_at         timestamptz,
  -- The owner reply as Google last reported it, whoever wrote it.
  google_reply              text,
  google_reply_updated_at   timestamptz,
  -- new               stored; no card sent yet (the sync retries these)
  -- pending           card is in Telegram, waiting on a review manager
  -- posting           a Post tap claimed it; the Google call is in flight
  -- posted            Google accepted our reply
  -- skipped           a review manager chose not to reply
  -- replied_elsewhere a reply appeared on Google that this flow did not send
  -- backlog           older than the notify window when first seen; no card
  status                    text not null default 'new' check (status in (
                              'new', 'pending', 'posting', 'posted',
                              'skipped', 'replied_elsewhere', 'backlog')),
  draft_reply               text,
  draft_source              text check (draft_source in ('claude', 'staff')),
  -- Bumped on every draft change; a Post tap carries the version it saw.
  draft_version             integer not null default 0,
  draft_error               text,
  posted_reply              text,
  posted_at                 timestamptz,
  acted_by_telegram_user_id bigint,
  acted_by_name             text,
  telegram_chat_id          bigint,
  telegram_message_id       bigint,
  last_error                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_google_reviews_status on google_reviews (status);
create index if not exists idx_google_reviews_card
  on google_reviews (telegram_chat_id, telegram_message_id);

drop trigger if exists trg_google_reviews_updated_at on google_reviews;
create trigger trg_google_reviews_updated_at
before update on google_reviews
for each row execute procedure set_updated_at();

alter table google_reviews enable row level security;
revoke all on public.google_reviews from anon, authenticated;
