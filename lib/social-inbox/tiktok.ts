import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { InboundAttachment, SocialEvent } from "@/lib/social-inbox/types";

/**
 * TikTok direct messages through the TikTok API for Business — Business
 * Messaging (open beta in APAC, Latin America, MENA and North America; not
 * available for users in the EEA, Switzerland or the UK).
 *
 * Unlike Meta's Page token, TikTok's access token lasts a day and a refresh
 * may return a new refresh token, so the tokens live in `social_channel_tokens`
 * rather than env. An admin connects the account once (Settings → Users &
 * permissions → Telegram → Connect TikTok); after that the token is
 * refreshed on use and by the daily cron. The refresh token lasts a year from
 * connecting — then the admin connects again (the tab says when).
 *
 * Docs: business-api.tiktok.com/portal/docs?id=1832183871604753
 *
 * Env: TIKTOK_APP_ID, TIKTOK_APP_SECRET (OAuth client and webhook signing).
 */

const TIMEOUT_MS = 8_000;
/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 10 * 60_000;
/**
 * A signed webhook older than this is refused as a replay. Generous on
 * purpose: TikTok retries a failed delivery for up to 72 hours, and a replayed
 * message is a no-op anyway (message ids are unique), so a tight window could
 * only lose real messages.
 */
const SIGNATURE_TOLERANCE_S = 72 * 3600;

/** What the account owner approves; TikTok lists all of these as needed for Business Messaging. */
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.profile",
  "user.account.type",
  "message.list.read",
  "message.list.send",
  "message.list.manage",
] as const;

function apiBase(): string {
  return `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION?.trim() || "v1.3"}`;
}

export function tiktokAppConfig(): { appId: string; secret: string } | null {
  const appId = process.env.TIKTOK_APP_ID?.trim();
  const secret = process.env.TIKTOK_APP_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

// ---------------------------------------------------------------------------
// Webhook verification and parsing
// ---------------------------------------------------------------------------

/**
 * `Tiktok-Signature: t=<unix seconds>,s=<hex>` where s is HMAC-SHA256 of
 * "<t>.<body>" with the app secret, and t is within the retry window. TikTok's
 * sample signs the body re-serialised (`JSON.stringify`), which is the raw body
 * whenever TikTok sends it compact — both forms are accepted.
 * Fails closed in production; open only in development with no secret set.
 */
export function verifyTikTokSignature(
  rawBody: string,
  header: string | null,
  now = new Date(),
  secret = process.env.TIKTOK_APP_SECRET?.trim(),
): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  const parts = Object.fromEntries(
    (header ?? "").split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.s) return false;
  if (Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const signs = (body: string) =>
    secretMatches(createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex"), parts.s);
  if (signs(rawBody)) return true;
  try {
    const compact = JSON.stringify(JSON.parse(rawBody));
    return compact !== rawBody && signs(compact);
  } catch {
    return false;
  }
}

type TikTokContent = {
  conversation_id?: string;
  message_id?: string;
  timestamp?: number;
  type?: string;
  text?: { body?: string };
  image?: { media_id?: string };
  video?: { media_id?: string };
  sticker?: { url?: string };
  emoji?: { url?: string };
  share_post?: { embed_url?: string };
  /** Set only on a welcome message, suggested-question answer or keyword reply. */
  auto_message_type?: string;
  from?: string;
  from_user?: { id?: string };
  to?: string;
  to_user?: { id?: string };
};

function toAttachments(content: TikTokContent): InboundAttachment[] {
  switch (content.type) {
    case "text":
      return [];
    case "image":
      // Fetching it needs our token, so Telegram can't show it from a URL.
      return [{ kind: "image", url: null }];
    case "video":
      return [{ kind: "video", url: null }];
    case "sticker":
    case "emoji":
      return [{ kind: "sticker", url: null }];
    case "share_post":
      return [{ kind: "share", url: content.share_post?.embed_url ?? null }];
    default:
      return [{ kind: "unsupported", url: null }];
  }
}

/**
 * `im_receive_msg` (a customer wrote) and `im_send_msg` (our account sent —
 * through us, the TikTok app or TikTok Business Center). `user_openid` is the
 * business account the event belongs to; events for any other account are
 * dropped. So are reactions (a ❤️ on a message isn't something to answer) and
 * TikTok's automatic messages (welcome message, suggested questions, keyword
 * replies), which would otherwise read as "already answered" under the card.
 * Messages from customers in the EEA, Switzerland or the UK come as
 * `im_receive_msg_eu` with no content at all; they stay in the TikTok app.
 */
export function parseTikTokWebhook(payload: unknown, businessId: string | null): SocialEvent[] {
  const body = payload as { event?: string; user_openid?: string; content?: string | TikTokContent } | null;
  if (body?.event !== "im_receive_msg" && body?.event !== "im_send_msg") return [];
  if (businessId && body.user_openid && body.user_openid !== businessId) return [];

  let content: TikTokContent | null = null;
  try {
    content = typeof body.content === "string" ? (JSON.parse(body.content) as TikTokContent) : (body.content ?? null);
  } catch {
    return [];
  }
  if (!content?.conversation_id || !content.message_id) return [];
  if (content.type === "reaction" || content.auto_message_type) return [];

  // The event name says who sent it; the user ids agree when present.
  const owner = body.user_openid ?? businessId;
  const incoming = owner && content.to_user?.id ? content.to_user.id === owner : body.event === "im_receive_msg";
  const sentAt = new Date(typeof content.timestamp === "number" ? content.timestamp : Date.now());
  const base = {
    platform: "tiktok" as const,
    externalId: content.conversation_id,
    messageId: content.message_id,
    text: content.type === "text" && content.text?.body?.trim() ? content.text.body : null,
    attachments: toAttachments(content),
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date().toISOString() : sentAt.toISOString(),
  };
  return [incoming ? { kind: "message", ...base, username: content.from?.trim() || null } : { kind: "echo", ...base }];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

type TikTokEnvelope<T> = { code?: number; message?: string; data?: T };

/** Business Messaging return codes the inbox reacts to. */
export const TIKTOK_INVALID_TOKEN = 40105;
const TIKTOK_MESSAGING_LIMIT = 40064;

async function callTikTok<T>(
  path: string,
  init: { method: "GET" | "POST"; token?: string; query?: Record<string, string>; body?: unknown },
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: number }> {
  const url = new URL(`${apiBase()}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  try {
    const res = await (deps.fetch ?? fetch)(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { "Access-Token": init.token } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as TikTokEnvelope<T> | null;
    if (!res.ok || !json || json.code !== 0) {
      return {
        ok: false,
        error: json?.message ? `${json.message} (${json.code})` : `TikTok returned ${res.status}`,
        ...(typeof json?.code === "number" ? { code: json.code } : {}),
      };
    }
    return { ok: true, data: json.data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "TikTok request failed" };
  }
}

/** Where an admin approves the app for the business account. */
export function tiktokAuthorizeUrl(state: string, redirectUri: string): string | null {
  const app = tiktokAppConfig();
  if (!app) return null;
  const url = new URL("https://www.tiktok.com/v2/auth/authorize");
  url.searchParams.set("client_key", app.appId);
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // Without it, an account that approved before (a reconnect) comes back with no code.
  url.searchParams.set("disable_auto_auth", "1");
  return url.toString();
}

type TokenData = {
  open_id?: string;
  scope?: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in: number;
};

export type TikTokTokens = {
  accountId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  scope: string | null;
};

function toTokens(data: TokenData, accountId: string, now: Date): TikTokTokens {
  return {
    accountId,
    accessToken: data.access_token,
    accessExpiresAt: new Date(now.getTime() + data.expires_in * 1000).toISOString(),
    refreshToken: data.refresh_token,
    refreshExpiresAt: new Date(now.getTime() + data.refresh_token_expires_in * 1000).toISOString(),
    scope: data.scope ?? null,
  };
}

export async function exchangeTikTokCode(
  code: string,
  redirectUri: string,
  now = new Date(),
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true; tokens: TikTokTokens } | { ok: false; error: string }> {
  const app = tiktokAppConfig();
  if (!app) return { ok: false, error: "TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set" };
  const res = await callTikTok<TokenData>(
    "/tt_user/oauth2/token/",
    {
      method: "POST",
      body: {
        client_id: app.appId,
        client_secret: app.secret,
        grant_type: "authorization_code",
        auth_code: code,
        redirect_uri: redirectUri,
      },
    },
    deps,
  );
  if (!res.ok) return res;
  if (!res.data.open_id) return { ok: false, error: "TikTok did not say which account was connected" };
  return { ok: true, tokens: toTokens(res.data, res.data.open_id, now) };
}

async function refreshTikTokTokens(
  refreshToken: string,
  accountId: string,
  now: Date,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true; tokens: TikTokTokens } | { ok: false; error: string }> {
  const app = tiktokAppConfig();
  if (!app) return { ok: false, error: "TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set" };
  const res = await callTikTok<TokenData>(
    "/tt_user/oauth2/refresh_token/",
    {
      method: "POST",
      body: { client_id: app.appId, client_secret: app.secret, grant_type: "refresh_token", refresh_token: refreshToken },
    },
    deps,
  );
  if (!res.ok) return res;
  return { ok: true, tokens: toTokens(res.data, accountId, now) };
}

export async function fetchTikTokAccountName(
  businessId: string,
  token: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<string | null> {
  const res = await callTikTok<{ username?: string; display_name?: string }>(
    "/business/get/",
    { method: "GET", token, query: { business_id: businessId, fields: JSON.stringify(["username", "display_name"]) } },
    deps,
  );
  if (!res.ok) return null;
  return res.data.username ? `@${res.data.username}` : (res.data.display_name ?? null);
}

/** Points TikTok's DIRECT_MESSAGE webhook at `callbackUrl` (one per app). */
export async function registerTikTokWebhook(
  callbackUrl: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const app = tiktokAppConfig();
  if (!app) return { ok: false, error: "TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set" };
  const res = await callTikTok<unknown>(
    "/business/webhook/update/",
    {
      method: "POST",
      body: { app_id: app.appId, secret: app.secret, event_type: "DIRECT_MESSAGE", callback_url: callbackUrl },
    },
    deps,
  );
  return res.ok ? { ok: true } : res;
}

/**
 * One text message (up to 6,000 characters — more than Telegram lets anyone
 * type). TikTok limits how many messages a business may send a customer who
 * isn't a mutual follow: up to 10 in the first 48 hours of a new chat, then no
 * limit within 48 hours of each customer reply, then 3 more until they write
 * again. It refuses with 40064 past that, which the agent is told in words.
 */
export async function sendTikTokText(
  businessId: string,
  token: string,
  conversationId: string,
  text: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string; code?: number }> {
  const res = await callTikTok<{ message?: { message_id?: string } }>(
    "/business/message/send/",
    {
      method: "POST",
      token,
      body: {
        business_id: businessId,
        recipient_type: "CONVERSATION",
        recipient: conversationId,
        message_type: "TEXT",
        text: { body: text },
      },
    },
    deps,
  );
  if (res.ok) return { ok: true, messageId: res.data?.message?.message_id || null };
  if (res.code === TIKTOK_MESSAGING_LIMIT) {
    return {
      ...res,
      error:
        "this chat has hit TikTok's messaging limit (10 messages in a new chat's first 48 hours; 3 once the customer has been quiet for 48 hours). It reopens when the customer writes again (40064)",
    };
  }
  return res;
}

// ---------------------------------------------------------------------------
// Token store (social_channel_tokens, platform = 'tiktok')
// ---------------------------------------------------------------------------

export type TikTokTokenRow = {
  platform: "tiktok";
  account_id: string;
  account_name: string | null;
  access_token: string;
  access_expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  connected_by: string | null;
  last_error: string | null;
  updated_at: string;
};

const TOKEN_COLUMNS =
  "platform,account_id,account_name,access_token,access_expires_at,refresh_token,refresh_expires_at,connected_by,last_error,updated_at";

export async function getTikTokTokenRow(): Promise<TikTokTokenRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("social_channel_tokens")
    .select(TOKEN_COLUMNS)
    .eq("platform", "tiktok")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TikTokTokenRow | null) ?? null;
}

export async function saveTikTokConnection(
  tokens: TikTokTokens,
  extra: { accountName: string | null; connectedBy: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("social_channel_tokens")
    .upsert(
      {
        platform: "tiktok",
        account_id: tokens.accountId,
        account_name: extra.accountName,
        access_token: tokens.accessToken,
        access_expires_at: tokens.accessExpiresAt,
        refresh_token: tokens.refreshToken,
        refresh_expires_at: tokens.refreshExpiresAt,
        connected_by: extra.connectedBy,
        last_error: null,
      },
      { onConflict: "platform" },
    );
  if (error) throw new Error(error.message);
}

/**
 * A usable access token, refreshing it when it is about to expire (`force`
 * refreshes anyway — the daily cron, to keep the refresh token rotating).
 *
 * The write is guarded on the refresh token we used, so when two requests
 * refresh at once only one rotation is stored; the loser re-reads and uses it.
 */
export async function tiktokAccess(
  opts: { now?: Date; force?: boolean; fetch?: typeof fetch } = {},
): Promise<{ ok: true; businessId: string; token: string } | { ok: false; error: string }> {
  const now = opts.now ?? new Date();
  const row = await getTikTokTokenRow();
  if (!row) return { ok: false, error: "TikTok isn't connected yet — an admin connects it under Settings → Users & permissions → Telegram." };

  const fresh = new Date(row.access_expires_at).getTime() - REFRESH_MARGIN_MS > now.getTime();
  if (fresh && !opts.force) return { ok: true, businessId: row.account_id, token: row.access_token };
  if (new Date(row.refresh_expires_at).getTime() <= now.getTime()) {
    return { ok: false, error: "The TikTok connection has expired — an admin needs to connect TikTok again." };
  }

  const refreshed = await refreshTikTokTokens(row.refresh_token, row.account_id, now, { fetch: opts.fetch });
  const admin = supabaseAdmin();
  if (!refreshed.ok) {
    await admin.from("social_channel_tokens").update({ last_error: refreshed.error }).eq("platform", "tiktok");
    // Someone else may have rotated it a moment ago.
    const again = await getTikTokTokenRow();
    if (again && again.refresh_token !== row.refresh_token && new Date(again.access_expires_at).getTime() > now.getTime()) {
      return { ok: true, businessId: again.account_id, token: again.access_token };
    }
    return fresh
      ? { ok: true, businessId: row.account_id, token: row.access_token }
      : { ok: false, error: `TikTok token refresh failed: ${refreshed.error}` };
  }

  const t = refreshed.tokens;
  const { data } = await admin
    .from("social_channel_tokens")
    .update({
      access_token: t.accessToken,
      access_expires_at: t.accessExpiresAt,
      refresh_token: t.refreshToken,
      refresh_expires_at: t.refreshExpiresAt,
      last_error: null,
    })
    .eq("platform", "tiktok")
    .eq("refresh_token", row.refresh_token)
    .select("access_token")
    .maybeSingle();
  if (data) return { ok: true, businessId: row.account_id, token: t.accessToken };
  const winner = await getTikTokTokenRow();
  return winner
    ? { ok: true, businessId: winner.account_id, token: winner.access_token }
    : { ok: false, error: "TikTok was disconnected while refreshing." };
}
