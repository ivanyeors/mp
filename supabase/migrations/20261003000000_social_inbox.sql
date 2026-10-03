-- Customer messages from Facebook, Instagram and TikTok in the measurements
-- Telegram group (PRD-social-inbox).
--
-- social_conversations: one row per person per platform — the id we reply to
--   (Messenger PSID, Instagram-scoped id, or TikTok conversation id), who they
--   are, and when they last wrote (each platform only accepts replies for a
--   while after the customer's last message).
--
-- social_messages: every message in or out. Inbound rows are posted to the
--   group as a Message card; outbound rows are what an Inbox agent sent by
--   replying to a card in Telegram, or a reply someone sent from the platform's
--   own app (seen as an echo). The Telegram message each row was posted as is
--   kept, so a reply to it finds the conversation.
--
-- social_channel_tokens: OAuth tokens that rotate and so cannot live in env
--   (TikTok: the access token lasts a day and every refresh issues a new
--   refresh token). Meta's Page token never expires and stays in env.
--
-- Server-only, like google_reviews: the service role reads and writes, RLS on
-- with no policies, client grants revoked.

-- Inbox agents answer customer messages; review managers may too.
alter table telegram_operators drop constraint if exists telegram_operators_role_check;
alter table telegram_operators add constraint telegram_operators_role_check
  check (role in ('review_manager', 'shop_moderator', 'inbox_agent'));

create table if not exists social_conversations (
  id                   uuid primary key default gen_random_uuid(),
  platform             text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  -- Who we send to: PSID (facebook), IGSID (instagram), conversation id (tiktok).
  external_id          text not null,
  display_name         text,
  username             text,
  last_inbound_at      timestamptz,
  last_outbound_at     timestamptz,
  -- The newest card for this conversation; the next card is threaded under it.
  last_card_chat_id    bigint,
  last_card_message_id bigint,
  profile_checked_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (platform, external_id)
);

drop trigger if exists trg_social_conversations_updated_at on social_conversations;
create trigger trg_social_conversations_updated_at
before update on social_conversations
for each row execute procedure set_updated_at();

alter table social_conversations enable row level security;
revoke all on public.social_conversations from anon, authenticated;

create table if not exists social_messages (
  id                         uuid primary key default gen_random_uuid(),
  conversation_id            uuid not null references social_conversations(id) on delete cascade,
  platform                   text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  direction                  text not null check (direction in ('inbound', 'outbound')),
  -- customer      the customer wrote it
  -- telegram      an Inbox agent replied to a card in the group
  -- platform_app  sent from the platform's own app (Meta Business Suite, TikTok)
  source                     text not null check (source in ('customer', 'telegram', 'platform_app')),
  -- The platform's message id (Meta mid, TikTok message_id); null while sending.
  external_message_id        text,
  body                       text,
  attachments                jsonb not null default '[]'::jsonb,
  sent_at                    timestamptz not null default now(),
  -- inbound:  new (no card yet; the sweep retries) → carding → carded
  -- outbound: sending → sent | failed; recorded (an echo from the platform app)
  status                     text not null check (status in (
                               'new', 'carding', 'carded', 'sending', 'sent', 'failed', 'recorded')),
  error                      text,
  unsent_at                  timestamptz,
  sent_by_telegram_user_id   bigint,
  sent_by_name               text,
  -- The bot's message in the group for this row (card, sent note or echo note).
  telegram_chat_id           bigint,
  telegram_message_id        bigint,
  -- The staff member's own Telegram message an outbound reply came from;
  -- unique so a redelivered Telegram update cannot send twice.
  telegram_source_message_id bigint,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Plain (not partial) unique constraints so upserts can name them; NULLs never
-- collide, so rows without an id yet are unaffected.
alter table social_messages drop constraint if exists social_messages_external_key;
alter table social_messages add constraint social_messages_external_key
  unique (platform, external_message_id);
alter table social_messages drop constraint if exists social_messages_telegram_source_key;
alter table social_messages add constraint social_messages_telegram_source_key
  unique (telegram_chat_id, telegram_source_message_id);
create index if not exists idx_social_messages_card
  on social_messages (telegram_chat_id, telegram_message_id);
create index if not exists idx_social_messages_conversation
  on social_messages (conversation_id, created_at);
create index if not exists idx_social_messages_status on social_messages (status);

drop trigger if exists trg_social_messages_updated_at on social_messages;
create trigger trg_social_messages_updated_at
before update on social_messages
for each row execute procedure set_updated_at();

alter table social_messages enable row level security;
revoke all on public.social_messages from anon, authenticated;

create table if not exists social_channel_tokens (
  platform            text primary key check (platform in ('tiktok')),
  -- TikTok: the business account's open_id (`business_id` in every API call).
  account_id          text not null,
  account_name        text,
  access_token        text not null,
  access_expires_at   timestamptz not null,
  refresh_token       text not null,
  refresh_expires_at  timestamptz not null,
  connected_by        text,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_social_channel_tokens_updated_at on social_channel_tokens;
create trigger trg_social_channel_tokens_updated_at
before update on social_channel_tokens
for each row execute procedure set_updated_at();

alter table social_channel_tokens enable row level security;
revoke all on public.social_channel_tokens from anon, authenticated;
