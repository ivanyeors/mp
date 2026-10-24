-- Website chat (the "Get in touch" chat on /support), replacing the Contact Us
-- form.
--
-- support_chats: one conversation a visitor starts on the website. Each one
-- is threaded in the staff Telegram group (MP_CONFIG_TELEGRAM_CHAT_ID): the
-- first message posts a root notice there, later customer messages reply to
-- it, and a staff member's Telegram reply to any of them is written back here
-- as a `staff` message, which the visitor's page picks up by polling.
--
-- Who may read a chat:
--   - whoever holds its token (the browser that started it keeps it in
--     sessionStorage, so a visitor without an account loses the chat when
--     they close the tab). Only its SHA-256 is stored.
--   - the signed-in customer it belongs to (`auth_user_id`), from any device:
--     a chat started while signed in, or one whose email matches the
--     customer's sign-in email.
--
-- `email` is always verified before the first message goes out: the signed-in
-- customer's own, or one a visitor without an account proved with a 6-digit
-- code (support_chat_codes, below). A transcript goes there when they end the
-- chat, leave the page, or get a staff reply while away (lib/support/chat.ts).
-- `transcript_message_count` is how many messages the last transcript covered,
-- so nothing is emailed twice for no new message. Messages are never deleted,
-- so their count is also the page's poll version.
--
-- `last_seen_at` is the visitor's last poll and `left_at` the page's pagehide
-- beacon: together they say whether a staff reply is seen on the page or
-- needs the email.
--
-- support_chat_codes: the 6-digit code a visitor without an account is
-- emailed before their first message goes out, which proves the address the
-- chat's transcripts will go to. It is not a sign-in: no auth user, no
-- session. `code_hash` is `salt:sha256(salt:code)` (lib/partner-backup-email.ts).
-- A code works for 10 minutes and 5 tries, once. Rows older than a day are
-- deleted whenever a new code is issued.
--
-- support_chat_messages: what each side wrote, plain text. `telegram_message_id`
-- is the group message carrying it (the bot's notice for a customer message,
-- the staff member's own message for a staff one), so a reply to either finds
-- the chat. Message ids are per chat in Telegram and every one here is in the
-- one group, so they are unique.
--
-- Server-only: RLS on, no policy, nothing granted to anon or authenticated.
-- app/api/support/chat reads and writes with the service role after checking
-- the token or the session.
--
-- Idempotent.

create table if not exists public.support_chats (
  id                        uuid primary key default gen_random_uuid(),
  token_hash                text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  customer_id               uuid null references public.customers(id) on delete set null,
  auth_user_id              uuid null references auth.users(id) on delete set null,
  name                      text null check (name is null or length(btrim(name)) between 1 and 200),
  email                     text not null check (length(email) between 3 and 320),
  status                    text not null default 'open' check (status in ('open', 'ended')),
  -- The start of the first message, for the signed-in customer's list of chats.
  preview                   text not null check (length(preview) between 1 and 200),
  telegram_root_message_id  bigint null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  last_message_at           timestamptz not null default now(),
  last_seen_at              timestamptz null,
  left_at                   timestamptz null,
  ended_at                  timestamptz null,
  transcript_emailed_at     timestamptz null,
  transcript_message_count  integer not null default 0 check (transcript_message_count >= 0),
  constraint support_chats_ended check ((status = 'ended') = (ended_at is not null))
);

create index if not exists support_chats_auth_user_idx
  on public.support_chats (auth_user_id, last_message_at desc)
  where auth_user_id is not null;

-- Adopting a visitor's chats into the account with the same email.
create index if not exists support_chats_unowned_email_idx
  on public.support_chats (lower(email))
  where auth_user_id is null;

alter table public.support_chats enable row level security;
revoke all on public.support_chats from anon, authenticated;

drop trigger if exists trg_support_chats_updated_at on public.support_chats;
create trigger trg_support_chats_updated_at
before update on public.support_chats
for each row execute procedure public.set_updated_at();

create table if not exists public.support_chat_messages (
  id                    bigint generated always as identity primary key,
  chat_id               uuid not null references public.support_chats(id) on delete cascade,
  sender                text not null check (sender in ('customer', 'staff')),
  body                  text not null check (length(btrim(body)) between 1 and 4000),
  -- The Telegram first name of the staff member who replied; null for the customer.
  staff_name            text null check (staff_name is null or length(staff_name) <= 100),
  telegram_message_id   bigint null,
  created_at            timestamptz not null default now(),
  constraint support_chat_messages_staff_name check ((sender = 'staff') or (staff_name is null))
);

create index if not exists support_chat_messages_chat_idx
  on public.support_chat_messages (chat_id, created_at);

create unique index if not exists support_chat_messages_telegram_idx
  on public.support_chat_messages (telegram_message_id)
  where telegram_message_id is not null;

alter table public.support_chat_messages enable row level security;
revoke all on public.support_chat_messages from anon, authenticated;

create table if not exists public.support_chat_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (length(email) between 3 and 320),
  code_hash   text not null check (code_hash ~ '^[0-9a-f]+:[0-9a-f]{64}$'),
  attempts    integer not null default 0 check (attempts >= 0),
  expires_at  timestamptz not null,
  used_at     timestamptz null,
  created_at  timestamptz not null default now()
);

-- How many codes an address got lately, and the day-old sweep.
create index if not exists support_chat_codes_email_idx
  on public.support_chat_codes (email, created_at desc);
create index if not exists support_chat_codes_created_idx
  on public.support_chat_codes (created_at);

alter table public.support_chat_codes enable row level security;
revoke all on public.support_chat_codes from anon, authenticated;
