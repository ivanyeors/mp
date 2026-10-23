# PRD: Customer messages from Facebook, Instagram and TikTok through Telegram

Status: Built (needs Meta App Review + TikTok Business Messaging access review + ops setup — see `OPS-CHECKLIST.md`)

## Problem Statement

Customers ask about sizes, fittings, prices and delivery in DMs: Messenger on the Facebook Page,
Instagram Direct, and TikTok. Each lives in its own app, on whoever's phone is logged in, so
messages wait hours, two people answer the same question, or nobody does.

Staff already live in one Telegram group — the measurements group, where configurator submissions
and review cards (PRD-google-review-replies) arrive — so that is where customer messages should
land, and where they should be answered from.

## Solution

1. **Platform → inbox.** Meta (Messenger + Instagram, one app, one Page token) and TikTok (Business
   Messaging API) call a webhook for every message. The webhook verifies the platform's signature,
   acknowledges at once, and stores the message in `social_messages` (keyed by the platform's
   message id, so a redelivery is a no-op) under a `social_conversations` row for that person.
2. **Telegram card.** Each customer message is posted to the measurements group as a **Message
   card** headed `💬 INSTAGRAM DM · Jane Tan (@janetan)` (or FACEBOOK MESSAGE / TIKTOK DM), threaded
   under that customer's previous card. A photo Telegram can fetch becomes the card (the card is its
   caption); other attachments are listed with a link or "open the app to see it".
3. **Staff reply.** An **Inbox agent** (or Review manager) replies to the card in Telegram; the bot
   sends the text to the customer on the same platform and confirms with `📤 Sent to … by Ivan`.
   Replying to that note continues the conversation. A reply that starts with `//` is a **team
   note** and is never sent. Anyone else who replies is told it was **not** sent.
4. **Reply window.** Meta accepts API replies for 24 hours after the customer's last message (7 days
   with the Human Agent permission, `META_HUMAN_AGENT_ENABLED`). Past that the bot refuses before
   calling Meta and says which app to answer from instead. TikTok has no time limit but caps
   messages to a customer who isn't a mutual follow — up to 10 in a new chat's first 48 hours, no
   cap within 48 hours of each customer reply, then 3 more until they write again — and refuses
   with code 40064, which the bot turns into a sentence.
5. **Echoes.** A reply someone sends from Meta Business Suite, the Instagram app or the TikTok app
   comes back as an echo and is noted under the customer's card (`↪️ Answered in …`), so the group
   never answers twice. The echo of our own Telegram reply is matched and ignored. TikTok's
   automatic messages (welcome message, suggested questions, keyword replies) and reactions are
   dropped — neither is a person answering.
6. **RBAC.** Same Telegram access tab as review cards (Staff Management → Telegram access), with a
   new role **Inbox agent** (customer messages only). Review managers can answer too; shop
   moderators cannot.
7. **TikTok connect.** TikTok tokens expire daily and rotate, so they live in the database
   (`social_channel_tokens`), not env. An admin taps **Connect TikTok** on the Telegram access tab
   once; on production the callback also points TikTok's webhook at the site. The access token
   is refreshed on use and daily by the cron; the connection itself lasts a year, and the tab says
   "reconnect by …" in its last month.
8. **Preview.** "Send preview" on the same tab now ends with a sample Instagram card; replying to it
   tells the person whether they can answer customers, and sends nothing.

## User stories

1. As a customer, I DM Mpillow on Instagram, Facebook or TikTok and get an answer in the same app,
   usually within minutes.
2. As an inbox agent, I see every new customer message in the Telegram group I already use, with
   the customer's name and the platform on the first line.
3. As an inbox agent, I answer by replying to the card, and I'm told when it has been sent.
4. As an inbox agent, I can discuss a message with colleagues under its card with `//` without the
   customer seeing it.
5. As a team, we see when someone answered from the platform's own app, so we don't answer twice.
6. As a team member who is not set up, replying to a card tells me it was not sent and how to get
   access — I never think a customer got an answer they didn't.
7. As an inbox agent, a reply that the platform would refuse (too late, too long) is refused with a
   reason before anything is sent, and a platform error is shown to me word for word.
8. As an owner/admin, I decide who can answer customers from Settings, and can see which platforms
   are connected; connecting TikTok is one button.
9. As the business, a message is never lost because Telegram was briefly down: it is stored first
   and carded again by the next webhook or the daily cron.

## Implementation decisions

- **Telegram is the inbox; the platforms are the record.** No conversation UI in the back office.
  Rows exist for dedupe, routing replies and auditing, not as a CRM.
- **Direct send on reply, `//` for notes.** Unlike Google review replies (public, permanent →
  draft then Post), DMs are private and conversational, so a reply is sent straight away — the
  same convention as Telegram support bots. The card footer says so on every card, and anyone not
  allowed is told "Not sent".
- **No Claude drafts in v1.** DM answers depend on live stock, prices and availability Claude does
  not have; a wrong answer in a DM is worse than a slower right one.
- **Routing without I/O.** Every bot message about a conversation starts with a fixed prefix
  (`💬 FACEBOOK MESSAGE`, `💬 INSTAGRAM DM`, `💬 TIKTOK DM`, `📤 Sent to`, `↪️ Answered in`), so the
  Telegram webhook can route a reply cheaply; the stored `(telegram_chat_id, telegram_message_id)`
  then names the conversation. Bots in privacy mode still receive replies to their own messages,
  which is all this needs.
- **Instagram through the Page.** "Instagram API with Facebook Login": the Instagram professional
  account is linked to the Facebook Page, DMs arrive on the same Meta webhook (`object: instagram`),
  and replies use the Page Send API with the same never-expiring Page token as Messenger.
- **Idempotency.** Inbound: unique `(platform, external_message_id)`; card send claimed
  `new → carding → carded`; a claim older than 5 minutes is released. Outbound: unique
  `(telegram_chat_id, telegram_source_message_id)`, so a redelivered Telegram update never sends
  twice. Echo of our own send: matched by message id, or by text while the send is in flight.
- **Webhook auth.** Meta: `X-Hub-Signature-256` with `META_APP_SECRET`; TikTok: `Tiktok-Signature`
  (`t=…,s=…`, HMAC of `t.body`) with `TIKTOK_APP_SECRET`, and `t` within TikTok's 72-hour retry
  period — a replay is a no-op (unique message ids), so a tighter window could only drop real
  retries. TikTok's sample signs the body re-serialised, so both the raw and the compact form are
  checked. Both fail closed in production.
- **TikTok, from its docs** (business-api.tiktok.com/portal/docs?id=1832183871604753 — not
  developers.tiktok.com, whose only DM scopes are the EU/UK Data Portability export). The redirect
  URL must end in `/`; the authorize link adds `disable_auto_auth=1` so a reconnect always gets a
  code; scopes include `user.account.type`; an invalid-token reply (40105) is retried once with a
  refreshed token. Customers in the EEA, Switzerland and the UK arrive as `im_receive_msg_eu` with
  no content and stay in the TikTok app.
- **Graph API version** `v24.0` by default (`META_GRAPH_VERSION` to change it). The WhatsApp code
  still pins `v21.0`; Meta retires versions about two years after release, so that one is due for a
  bump too.

## States (`social_messages.status`)

Inbound: `new` (stored, no card) → `carding` → `carded`; `carding` → `new` on a failed send.
Outbound from Telegram: `sending` → `sent` | `failed`. Echo from a platform app: `recorded`.

## Out of scope (v1)

- Sending photos or files from Telegram (text only; the card says to use the app).
- Comments on posts (only direct messages).
- WhatsApp customer chats (the staffed WhatsApp line is the Business app; the Cloud API number is
  appointment reminders only).
- Claude-drafted replies, canned answers, assignment ("who's on this") and SLA reminders for
  unanswered messages.
- A back-office conversation history page.
