import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import type { SocialPlatform } from "@/lib/social-inbox/platforms";
import type { InboundAttachment, SocialEvent } from "@/lib/social-inbox/types";

/**
 * Facebook Messenger and Instagram Direct, through one Meta app and one
 * Facebook Page.
 *
 * Instagram uses "Instagram API with Facebook Login": the Instagram
 * professional account is linked to the Page, its DMs arrive on the same
 * webhook (object "instagram"), and replies go out through the Page's Send API
 * with the same Page access token as Messenger. One token, one webhook, two
 * platforms.
 *
 * Env: META_PAGE_ACCESS_TOKEN (a never-expiring system-user Page token),
 * META_APP_SECRET (signs webhooks; also sent as appsecret_proof),
 * META_WEBHOOK_VERIFY_TOKEN, and optionally META_PAGE_ID / INSTAGRAM_ACCOUNT_ID
 * to ignore any other Page the app is subscribed to. scripts/social-inbox-setup.ts
 * prints the ids and subscribes the Page.
 */

const TIMEOUT_MS = 8_000;

export function graphBase(): string {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v24.0";
  return `https://graph.facebook.com/${version}`;
}

export function metaConfigured(): boolean {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN?.trim());
}

/** Ids this deployment answers for; an unset id accepts any (the signature still gates). */
export function metaAccountIds(): { pageId: string | null; instagramId: string | null } {
  return {
    pageId: process.env.META_PAGE_ID?.trim() || null,
    instagramId: process.env.INSTAGRAM_ACCOUNT_ID?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/** GET subscribe handshake: echo the challenge only for our verify token. */
export function verifyMetaChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (params.mode === "subscribe" && secretMatches(expected, params.token)) return params.challenge;
  return null;
}

/**
 * X-Hub-Signature-256: HMAC-SHA256 of the raw body with the app secret.
 * Fails closed in production; open only in development with no secret set.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  secret = process.env.META_APP_SECRET?.trim(),
): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return secretMatches(expected, header.slice("sha256=".length));
}

// ---------------------------------------------------------------------------
// Webhook parsing
// ---------------------------------------------------------------------------

type MetaAttachment = {
  type?: string;
  title?: string;
  url?: string;
  payload?: { url?: string; title?: string; sticker_id?: number | string } | null;
};

type MetaMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: MetaAttachment[];
    reply_to?: { story?: { url?: string; id?: string } };
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

type MetaEntry = { id?: string; time?: number; messaging?: MetaMessaging[]; standby?: MetaMessaging[] };

function toAttachment(a: MetaAttachment): InboundAttachment {
  const url = a.payload?.url ?? a.url ?? null;
  const title = a.payload?.title ?? a.title ?? null;
  switch (a.type) {
    case "image":
      return a.payload?.sticker_id ? { kind: "sticker", url } : { kind: "image", url };
    case "video":
    case "audio":
    case "file":
      return { kind: a.type, url };
    case "story_mention":
      return { kind: "story_mention", url };
    case "location":
      return { kind: "location", url, title };
    case "share":
    case "fallback":
    case "template":
    case "post":
    case "ig_post":
    case "ig_reel":
    case "reel":
      return { kind: "share", url, title };
    default:
      return { kind: "unsupported", url: null };
  }
}

function isoFromMs(ms: number | undefined): string {
  const d = typeof ms === "number" ? new Date(ms) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Messenger (`object: "page"`) and Instagram (`object: "instagram"`) message
 * events. Reads, deliveries, reactions and anything without a message id are
 * dropped. Messages Meta routes to us on `standby` (another app or Meta's
 * inbox holds the thread) are still customer messages and are kept.
 */
export function parseMetaWebhook(
  payload: unknown,
  ids: { pageId: string | null; instagramId: string | null } = { pageId: null, instagramId: null },
): SocialEvent[] {
  const body = payload as { object?: string; entry?: MetaEntry[] } | null;
  const platform: SocialPlatform | null =
    body?.object === "page" ? "facebook" : body?.object === "instagram" ? "instagram" : null;
  if (!platform || !Array.isArray(body?.entry)) return [];
  const accountId = platform === "facebook" ? ids.pageId : ids.instagramId;

  const events: SocialEvent[] = [];
  for (const entry of body.entry) {
    if (accountId && entry.id && entry.id !== accountId) continue;
    const items = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
    for (const item of items) {
      const sender = item.sender?.id;
      const recipient = item.recipient?.id;
      if (!sender || !recipient || sender === recipient) continue;

      if (item.postback?.mid) {
        // A tap on one of our buttons (ice breaker, menu): its label is what they "said".
        events.push({
          kind: "message",
          platform,
          externalId: sender,
          messageId: item.postback.mid,
          text: item.postback.title ?? item.postback.payload ?? null,
          attachments: [],
          sentAt: isoFromMs(item.timestamp),
        });
        continue;
      }

      const message = item.message;
      if (!message?.mid) continue;
      if (message.is_deleted) {
        events.push({ kind: "unsend", platform, externalId: sender, messageId: message.mid });
        continue;
      }

      const attachments = (message.attachments ?? []).map(toAttachment);
      if (message.reply_to?.story) {
        attachments.unshift({ kind: "story_reply", url: message.reply_to.story.url ?? null });
      }
      if (message.is_unsupported && attachments.length === 0) attachments.push({ kind: "unsupported", url: null });
      const text = message.text?.trim() ? message.text : null;

      events.push(
        message.is_echo
          ? { kind: "echo", platform, externalId: recipient, messageId: message.mid, text, attachments, sentAt: isoFromMs(item.timestamp) }
          : { kind: "message", platform, externalId: sender, messageId: message.mid, text, attachments, sentAt: isoFromMs(item.timestamp) },
      );
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Graph API calls
// ---------------------------------------------------------------------------

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

function authQuery(token: string): string {
  const params = new URLSearchParams({ access_token: token });
  const secret = process.env.META_APP_SECRET?.trim();
  // Required when the app has "Require app secret" on; harmless otherwise.
  if (secret) params.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  return params.toString();
}

function describeGraphError(json: GraphError | null, status: number): string {
  const e = json?.error;
  if (!e) return `Meta returned ${status}`;
  const code = e.code ? ` (#${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : "";
  return `${e.message ?? "Meta refused the message"}${code}`;
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

/**
 * One text message through the Page's Send API — the same call for Messenger
 * (PSID) and Instagram (IGSID). `tag` is HUMAN_AGENT outside the 24-hour
 * window (see platforms.ts).
 */
export async function sendMetaText(
  recipientId: string,
  text: string,
  tag: "HUMAN_AGENT" | null,
  deps: { fetch?: typeof fetch } = {},
): Promise<SendResult> {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "Facebook/Instagram replies aren't connected yet (META_PAGE_ACCESS_TOKEN missing)." };
  const doFetch = deps.fetch ?? fetch;
  try {
    const res = await doFetch(`${graphBase()}/me/messages?${authQuery(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
        ...(tag ? { tag } : {}),
        message: { text },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as (GraphError & { message_id?: string }) | null;
    if (!res.ok || json?.error) return { ok: false, error: describeGraphError(json, res.status) };
    return { ok: true, messageId: json?.message_id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Meta send failed" };
  }
}

/**
 * The customer's name (and Instagram handle) for the card. Best-effort: Meta
 * withholds profiles in some cases (privacy settings, error 230), and a card
 * without a name is still a card.
 */
export async function fetchMetaProfile(
  platform: "facebook" | "instagram",
  id: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ displayName: string | null; username: string | null } | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const fields = platform === "facebook" ? "first_name,last_name" : "name,username";
  try {
    const res = await (deps.fetch ?? fetch)(`${graphBase()}/${encodeURIComponent(id)}?fields=${fields}&${authQuery(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      first_name?: string;
      last_name?: string;
      name?: string;
      username?: string;
    } | null;
    if (!json) return null;
    const displayName =
      json.name?.trim() || [json.first_name, json.last_name].filter((s) => s?.trim()).join(" ").trim() || null;
    return { displayName, username: json.username?.trim() || null };
  } catch {
    return null;
  }
}
