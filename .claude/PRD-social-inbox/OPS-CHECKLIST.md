# OPS checklist: Facebook, Instagram and TikTok messages in Telegram

Everything below happens outside the code. The slow parts are the platform approvals — Meta App
Review (part 1, step 8) and TikTok's Business Messaging access review (part 2, step 2.5) — so start
those first. Parts 3–4
work as soon as the migration is applied, and the Send preview lets the team practise before any
real message arrives.

Meta's and TikTok's dashboards are renamed often; if a menu name below doesn't match, look for the
nearest equivalent — the thing being set is what matters.

---

## Part 1 — Facebook Messenger and Instagram (one Meta app, one Page token)

### 1. Link Instagram to the Facebook Page and allow API access to DMs

1. The Instagram account must be a **professional** account (Business). Instagram app → Settings →
   Account type and tools.
2. Meta Business Suite → Settings → **Instagram accounts** → connect it to the Mpillow Facebook
   Page (same business portfolio that owns the Page).
3. Instagram app → Settings → **Messages and story replies** → Message controls → **Connected
   tools** → turn on **Allow access to messages**. Without this, Instagram DMs never reach any API.

### 2. Use the existing Meta app

Use the Meta app that already runs WhatsApp (developers.facebook.com → My Apps). One app can serve
WhatsApp, Messenger and Instagram; each gets its own webhook URL. Then `META_APP_SECRET` is the
same value as `WHATSAPP_APP_SECRET`.

In the app, add the **Messenger** use case ("Engage with customers on Messenger from Meta") and the
**Instagram** use case ("Manage messaging & content on Instagram" → **API setup with Facebook
login**).

### 3. A never-expiring Page token

1. business.facebook.com → Settings → Users → **System users** → the existing admin system user
   (the WhatsApp one) or a new one.
2. **Assign assets** → the Facebook Page (full control, or at least *Messages*) and the Instagram
   account (*Messages*).
3. **Generate new token** → this app → expiry **Never** → permissions: `pages_messaging`,
   `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`,
   `instagram_manage_messages`, `business_management`.
4. Exchange it for the Page's own token:

   ```bash
   curl "https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token&access_token=<SYSTEM_USER_TOKEN>"
   ```

   Copy the `access_token` next to the Mpillow Page → that is `META_PAGE_ACCESS_TOKEN`.

### 4. Environment (Vercel + `.env.local`)

```
META_PAGE_ACCESS_TOKEN=<from step 3>
META_APP_SECRET=<App settings → Basic → App secret>
META_WEBHOOK_VERIFY_TOKEN=<openssl rand -hex 32>
```

Then find the ids and check the token:

```bash
npx tsx --env-file=.env.local scripts/social-inbox-setup.ts
```

It prints `META_PAGE_ID=…` and `INSTAGRAM_ACCOUNT_ID=…` — add both to Vercel and `.env.local`
(they make the webhook ignore any other Page the app might be subscribed to). **Redeploy** so the
webhook below can verify.

### 5. Webhooks in the Meta app

App dashboard → **Webhooks** (or Messenger / Instagram → Configure webhooks):

| Object     | Callback URL                                            | Verify token                | Fields                                          |
| ---------- | ------------------------------------------------------- | --------------------------- | ----------------------------------------------- |
| Page       | `https://custom.mpillow.com/api/webhooks/meta-messages` | `META_WEBHOOK_VERIFY_TOKEN` | `messages`, `message_echoes`, `messaging_postbacks` |
| Instagram  | `https://custom.mpillow.com/api/webhooks/meta-messages` | `META_WEBHOOK_VERIFY_TOKEN` | `messages`, `messaging_postbacks`               |

"Verify and save" must succeed — if it fails, the env from step 4 isn't deployed yet. The WhatsApp
webhook (`/api/webhooks/whatsapp`) stays as it is.

### 6. Subscribe the Page to the app

```bash
npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --subscribe
```

The last lines should show this app with `messages, message_echoes, messaging_postbacks`. Both
Messenger and Instagram DMs need this.

### 7. Test while the app is in development

Until App Review (step 8), Meta only delivers messages from people who have a **role on the app**
(Admin, Developer or Tester — App roles → Roles). Add a team member as Tester, have them message
the Page and the Instagram account from their personal accounts, and check part 4.

### 8. App Review (for real customers)

App Review → Permissions and features → request **Advanced access** for `pages_messaging`,
`instagram_manage_messages` (and `instagram_basic`, `pages_manage_metadata` if asked). Meta wants a
short screencast: a customer DM appearing in Telegram, an agent replying, the reply arriving.
Business verification must be complete (it already is if WhatsApp is live).

Optional, same place: the **Human Agent** feature. Once approved, set
`META_HUMAN_AGENT_ENABLED=true` and redeploy — agents can then reply up to **7 days** after the
customer's last message instead of 24 hours.

---

## Part 2 — TikTok

Everything here is on **TikTok API for Business** (business-api.tiktok.com/portal), not
developers.tiktok.com — that portal is for TikTok login and video-posting apps and has no business
inbox. Reference: [Business Messaging API](https://business-api.tiktok.com/portal/docs?id=1832183871604753).

Business Messaging is in open beta in APAC (Singapore included), Latin America, MENA and North
America. It can't manage TikTok accounts signed up in the EEA, Switzerland or the UK, and messages
from customers there never reach the API — they stay in the TikTok app.

### 1. The TikTok account

1. It must be a Business Account with **Advanced Access** or a **Verified Business Account** — a
   plain account can't use the API
   ([account entitlements](https://ads.tiktok.com/resources/help/article/about-tiktok-account-entitlements)).
   The account owner must be over 18.
2. TikTok app → Profile → ☰ → Settings and privacy → Privacy → Direct messages → **Permission
   settings** → set both **Potential connections** and **Others on TikTok** to **Inbox** (older
   app versions: "Allow direct messages from → Everyone"). Otherwise a new customer's first
   message is a message request, and nothing reaches the group until someone accepts it in the app.
   Leave **Safe mode** on; it can move a message from a sender TikTok thinks is unsafe to *filtered
   requests*, so check there if a customer says they wrote and no card came.
3. **TikTok Shop chats are separate.** Mpillow is a TikTok Shop seller; a customer who taps *Chat*
   on a product or order writes to TikTok Shop's seller inbox, which this API does not reach. Those
   stay in TikTok Shop Seller Center — only ordinary DMs to @thempillow come to the group.

### 2. A TikTok API for Business developer app

TikTok grants **Business Messaging** only after its data security review (step 5), and that review
needs an already-approved app. So the app is created first with the basic permissions TikTok's
[Business Messaging access guide](https://business-api.tiktok.com/portal/docs?id=1832184145137922)
names for a new app, and the messaging permissions are added once the review passes (step 6).

1. business-api.tiktok.com/portal → register as a developer (same login as TikTok for Business /
   Ads Manager; the developer profile must be approved first, in about 3 business days). The profile
   follows TikTok's [Register as a developer](https://business-api.tiktok.com/portal/docs?id=1738855176671234)
   rules:
   - **Email**: an `@mpillow.com` address. Personal email gets rejected.
   - **Account type**: Direct Advertiser, since we run our own account.
   - **Company website**: `https://www.mpillow.com`, the main site with the shared email domain and
     "Mellow Life Pte Ltd" in its footer. A profile with `custom.mpillow.com` was rejected as "unable
     to access your company website".
   - **Description**: say that Mellow Life Pte Ltd operates Mpillow and mpillow.com, which ties the
     company name to the domain. Then describe the messaging use case.

   Then **My Apps** → **Create app**:
   - **App name**: `Mpillow Inbox`
   - **App description** (under 500 characters):
     > Intended uses: in-house tool for Mpillow (mpillow.com), a Singapore pillow maker. Customers'
     > DMs to our own TikTok account (@thempillow) reach our staff's internal system, and staff reply
     > from there via the Business Messaging API and the account's basic profile. Ad Account
     > Management and Measurement are included as TikTok's Business Messaging access guide asks of a
     > new app.
     > Access controls: internal only, for our own account and staff; not offered to other businesses.
   - **Advertiser redirect URL**: `https://custom.mpillow.com/api/social-inbox/tiktok/callback/`
     (advertiser sign-in isn't used; this is just a valid page of ours)
   - **Scope of permission**: **Ad Account Management** and **Measurement**. TikTok's guide also
     names CTX Events Management, but it wasn't offered when we created the app. Don't add TikTok
     Accounts yet: since 20 March 2026 it needs its own form (step 6).
   - Submit. TikTok reviews it in 2–3 business days (My Apps → Verification Status).
2. Once approved: App Detail → **App logo** (JPG/PNG, at most 512×512) — without it TikTok's sign-in
   page shows an error.
3. (Step 6.) App Detail → **Authorization → Scope of permission** → **TikTok Accounts** and
   **Business Messaging**.
4. **TikTok account holder redirect URL** (App Detail → Basic Information, once TikTok Accounts is
   granted): `https://custom.mpillow.com/api/social-inbox/tiktok/callback/` — **with the `/` at the
   end**; TikTok refuses it without. If the app has several, click this one so it is the active one.
5. **Business Messaging access review** (the slow part) — once the app from step 1 is approved, as
   the form wants its App ID. Fill in the
   [intake form](https://bytedance.sg.larkoffice.com/share/base/form/shrlg7vFArGhg9V20neYCEwIKrb)
   linked from [Access to Business Messaging API](https://business-api.tiktok.com/portal/docs?id=1832184145137922).
   Within about 10 working days TikTok emails the contact person a *"TikTok/ByteDance Third-Party
   Due Diligence Questionnaire"* (data security & privacy review); the assessment normally takes
   2–4 weeks after that. Answer it fully and quickly, attaching any security documents you have,
   and reply promptly to follow-ups. **Leave the US out of the application** — it adds a separate
   US review, and the Mpillow account is in Singapore. There is no progress tracker; approval
   arrives by email.
6. **Add the messaging permissions** once step 5 is approved. First fill in TikTok's
   [Accounts API Access Application Form](https://bytedance.sg.larkoffice.com/share/base/form/shrlgu4WEvtSXpEDLcCw56u4Rfc)
   (required since 20 March 2026 for any app asking for **TikTok Accounts**): our own account,
   internal staff tool, basic profile plus Business Messaging. Then request the scope increase in
   step 3 and set the redirect URL in step 4.

### 3. Environment

```
TIKTOK_APP_ID=<App Detail → Basic Information → App ID>
TIKTOK_APP_SECRET=<App Detail → Basic Information → Secret>
```

Add to Vercel (and `.env.local`), **redeploy**.

### 4. Connect the account

On **production**: Settings → Staff Management → **Telegram access** → Customer messages →
**Connect TikTok** → sign in as the Mpillow TikTok business account → approve **every** permission
shown (send messages, read messages, read account type, read and manage messages). You land back on
the tab with "TikTok connected as @…". On production this also registers TikTok's message webhook
at `https://custom.mpillow.com/api/webhooks/tiktok-messages` (a preview deployment never does, so
it can't steal production's webhook).

Check (or repair) the webhook any time:

```bash
npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --tiktok-webhook https://custom.mpillow.com/api/webhooks/tiktok-messages
```

The access token refreshes itself — on use, and daily from the `results-sla` cron. The connection
itself lasts **a year**: in its last month the tab shows "reconnect by …"; tap **Reconnect TikTok**
before then. If it ever shows "last refresh failed", reconnect too.

Limits to know:

- **No time limit**, but TikTok caps messages to a customer who isn't a mutual follow: up to **10**
  in a new chat's first 48 hours, no cap within 48 hours of each customer reply, and only **3
  more** once they've been quiet for 48 hours — until they write again. Past that the bot says
  "❌ Not sent — TikTok said: this chat has hit TikTok's messaging limit…".
- Image messages work only in some markets; a photo card always says to open the TikTok app.
- TikTok's own automatic messages (welcome message, suggested questions, keyword replies) and
  reactions don't appear in the group.

---

## Part 3 — Database

Apply `supabase/migrations/20261003000000_social_inbox.sql` (`pnpm db:push`). It adds
`social_conversations`, `social_messages`, `social_channel_tokens`, and the **Inbox agent** role.

## Part 4 — Telegram access and a dry run

1. Settings → Staff Management → **Telegram access** → add each person who answers customers with
   role **Inbox agent** (Review managers can already answer) → copy their `/link CODE` → they send
   it to the bot (privately, or `/link@<bot_username> CODE` in the group).
2. **Send preview** → the last card is a sample Instagram message. Each person replies to it; the
   bot answers "On a real card, this reply would be sent…" with their role, or tells them they're
   not set up. Nothing is sent to anyone.
3. Real test, per platform: message the business from a personal account → a `💬` card appears in
   the group within seconds → reply to it → the message arrives on the phone → `📤 Sent to …`
   appears under the reply. Then answer from the platform's own app → `↪️ Answered in …` appears
   under the card.

---

## How the team uses it (pin this in the group)

- **Reply to a 💬 card** (or to the 📤 / ↪️ notes under it) → it goes to that customer, on that app.
- **Start with `//`** → a note for the team; the customer never sees it.
- **Text only.** Photos, files and voice notes: send them from the platform's own app.
- **24 hours** after the customer's last message (Facebook/Instagram), the bot will refuse and tell
  you to answer from the app instead. TikTok has no time limit, but once a customer has been quiet
  for 48 hours only 3 more messages go through until they write again.
- **↪️ Answered in …** means someone already replied from the app — don't answer twice.
- **❌ Not sent — …** means exactly that; the reason follows.

## Troubleshooting

- **No cards at all** — Vercel logs for `/api/webhooks/meta-messages`: a 401 means
  `META_APP_SECRET` is wrong; nothing logged means the webhook fields (part 1, step 5) or the Page
  subscription (step 6) are missing, or the sender has no app role while the app is in development.
- **Facebook works, Instagram doesn't** — "Allow access to messages" (part 1, step 1.3), and the
  Instagram object in the webhooks table.
- **"Not sent — Instagram said: … (#10)" or "(#200)"** — usually Meta Business Suite holds the
  conversation: Business Suite → Settings → **Conversation routing** / Advanced messaging → let this
  app receive and reply to messages. Also check the token's permissions (part 1, step 3).
- **"(#551) This person isn't available right now"** — the customer blocked the Page or deleted
  the conversation.
- **A card shows "Photo — open … to see it"** — Telegram couldn't fetch the image (TikTok images
  always need the app).
- **TikTok cards stopped** — Telegram access tab shows the TikTok state; Reconnect, then re-run the
  webhook check above.
- **TikTok connected, but no cards ever** — both message permissions set to Inbox (part 2, step 1.2)?
  Message requests wait in the app until accepted. A customer in the EEA, Switzerland or the UK
  never reaches the API, and neither does a TikTok Shop chat (part 2, step 1.3).
- **TikTok sign-in shows an error page** — the app has no logo (part 2, step 2.2), or the redirect
  URL doesn't match: it must be exactly `…/api/social-inbox/tiktok/callback/`, ending in `/`.
- **"Not sent — TikTok said: … (40001)"** — no permission: the access review isn't approved yet,
  or a permission was left unticked when connecting (Reconnect TikTok and tick them all).
- **A message arrived but no card** — the message is stored (`social_messages`, status `new`, with
  the Telegram error in `error`); the next incoming message, or the daily cron, posts it.
