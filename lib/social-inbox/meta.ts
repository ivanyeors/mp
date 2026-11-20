import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { getPublicOrigin } from "@/lib/site-url";
import type { SocialPlatform } from "@/lib/social-inbox/platforms";
import type { InboundAttachment, SocialEvent } from "@/lib/social-inbox/types";

const TIMEOUT_MS = 8_000;

export function graphBase(): string {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v24.0";
  return `https://graph.facebook.com/${version}`;
}

export function metaConfigured(): boolean {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN?.trim());
}

export function metaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || process.env.WHATSAPP_APP_SECRET?.trim() || undefined;
}

export const META_PAGE_FIELDS = ["messages", "message_echoes", "messaging_postbacks"] as const;
export const META_INSTAGRAM_FIELDS = ["messages", "messaging_postbacks"] as const;

export function metaAccountIds(): { pageId: string | null; instagramId: string | null } {
  return {
    pageId: process.env.META_PAGE_ID?.trim() || null,
    instagramId: process.env.INSTAGRAM_ACCOUNT_ID?.trim() || null,
  };
}

export function verifyMetaChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (params.mode === "subscribe" && secretMatches(expected, params.token)) return params.challenge;
  return null;
}

export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  secret = metaAppSecret(),
): boolean {
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return secretMatches(expected, header.slice("sha256=".length));
}

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

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

function authQuery(token: string): string {
  const params = new URLSearchParams({ access_token: token });
  const secret = metaAppSecret();
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

export const META_WEBHOOK_PATH = "/api/webhooks/meta-messages";

export function productionMetaWebhookUrl(req: Request): string | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  return `${getPublicOrigin(req)}${META_WEBHOOK_PATH}`;
}

type GraphCall = { ok: true; json: Record<string, unknown> } | { ok: false; error: string };

async function graphCall(
  path: string,
  query: string,
  init: { method?: "GET" | "POST"; form?: Record<string, string> },
  deps: { fetch?: typeof fetch },
): Promise<GraphCall> {
  try {
    const res = await (deps.fetch ?? fetch)(`${graphBase()}${path}?${query}`, {
      method: init.method ?? "GET",
      ...(init.form
        ? { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(init.form).toString() }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as (GraphError & Record<string, unknown>) | null;
    if (!res.ok || json?.error) return { ok: false, error: setupHint(describeGraphError(json, res.status)) };
    return { ok: true, json: json ?? {} };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Meta did not answer" };
  }
}

function setupHint(error: string): string {
  if (/appsecret_proof/i.test(error)) {
    return `${error} — the app secret is not from the app this token was made for. Set META_APP_SECRET to that app's secret (App settings → Basic).`;
  }
  if (/node type \(User\)/i.test(error)) {
    return `${error} — this is a user or system-user token, not the Page's own token (OPS checklist, part 1, step 3.4).`;
  }
  return error;
}

type MetaIdentity = {
  app: { id: string; name: string | null };
  page: { id: string; name: string | null };
  instagram: { id: string; username: string | null } | null;
};

async function metaIdentity(
  token: string,
  deps: { fetch?: typeof fetch },
): Promise<{ ok: true; identity: MetaIdentity } | { ok: false; error: string }> {
  const auth = authQuery(token);
  const [me, app] = await Promise.all([
    graphCall("/me", `fields=${encodeURIComponent("id,name,instagram_business_account{id,username}")}&${auth}`, {}, deps),
    graphCall("/app", `fields=id,name&${auth}`, {}, deps),
  ]);
  if (!me.ok) return me;
  if (!app.ok) return app;
  const page = me.json as { id?: string; name?: string; instagram_business_account?: { id?: string; username?: string } };
  const appJson = app.json as { id?: string; name?: string };
  if (!page.id || !appJson.id) return { ok: false, error: "Meta did not say which Page and app this token belongs to." };
  const ig = page.instagram_business_account;
  return {
    ok: true,
    identity: {
      app: { id: appJson.id, name: appJson.name ?? null },
      page: { id: page.id, name: page.name ?? null },
      instagram: ig?.id ? { id: ig.id, username: ig.username ?? null } : null,
    },
  };
}

type AppWebhook = { object: string; callbackUrl: string; active: boolean; fields: string[] };

function webhookProblem(
  label: string,
  hook: AppWebhook | undefined,
  fields: readonly string[],
  expectedUrl: string | null,
): string | null {
  if (!hook?.callbackUrl) return `Meta doesn't send ${label} messages to the site yet.`;
  if (!hook.active) return `Meta's ${label} webhook is switched off.`;
  const urlOk = expectedUrl ? hook.callbackUrl === expectedUrl : hook.callbackUrl.endsWith(META_WEBHOOK_PATH);
  if (!urlOk) return `Meta sends ${label} messages to ${hook.callbackUrl}, not ${expectedUrl ?? `…${META_WEBHOOK_PATH}`}.`;
  const missing = fields.filter((f) => !hook.fields.includes(f));
  if (missing.length > 0) return `Meta's ${label} webhook leaves out ${missing.join(", ")}.`;
  return null;
}

export type MetaSetup =
  | { ok: false; error: string }
  | {
      ok: true;
      page: { id: string; name: string | null };
      instagram: { id: string; username: string | null } | null;
      problems: string[];
    };

export async function checkMetaSetup(
  expectedUrl: string | null,
  deps: { fetch?: typeof fetch } = {},
): Promise<MetaSetup | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const found = await metaIdentity(token, deps);
  if (!found.ok) return found;
  const { app, page, instagram } = found.identity;

  const problems: string[] = [];
  const ids = metaAccountIds();
  if (ids.pageId && ids.pageId !== page.id) {
    problems.push(`META_PAGE_ID is ${ids.pageId}, but the token is for Page ${page.id} — every Facebook message is ignored.`);
  }
  if (ids.instagramId && instagram && ids.instagramId !== instagram.id) {
    problems.push(
      `INSTAGRAM_ACCOUNT_ID is ${ids.instagramId}, but the Page's Instagram account is ${instagram.id} — every Instagram message is ignored.`,
    );
  }

  const secret = metaAppSecret();
  const [hooks, subs] = await Promise.all([
    secret
      ? graphCall(`/${app.id}/subscriptions`, new URLSearchParams({ access_token: `${app.id}|${secret}` }).toString(), {}, deps)
      : null,
    graphCall(`/${page.id}/subscribed_apps`, authQuery(token), {}, deps),
  ]);

  if (!hooks) {
    problems.push("No app secret on this deployment (META_APP_SECRET) — production refuses every Facebook and Instagram webhook.");
  } else if (!hooks.ok) {
    problems.push(`Couldn't read the app's webhooks: ${hooks.error}`);
  } else {
    const rows = (hooks.json.data ?? []) as { object?: string; callback_url?: string; active?: boolean; fields?: { name?: string }[] }[];
    const byObject = (object: string): AppWebhook | undefined => {
      const row = rows.find((r) => r.object === object);
      return row
        ? {
            object,
            callbackUrl: row.callback_url ?? "",
            active: row.active !== false,
            fields: (row.fields ?? []).map((f) => f.name ?? ""),
          }
        : undefined;
    };
    for (const problem of [
      webhookProblem("Facebook", byObject("page"), META_PAGE_FIELDS, expectedUrl),
      webhookProblem("Instagram", byObject("instagram"), META_INSTAGRAM_FIELDS, expectedUrl),
    ]) {
      if (problem) problems.push(problem);
    }
  }

  if (!subs.ok) {
    problems.push(`Couldn't read the Page's subscriptions: ${subs.error}`);
  } else {
    const rows = (subs.json.data ?? []) as { id?: string; subscribed_fields?: string[] }[];
    const ours = rows.find((r) => r.id === app.id);
    const missing = META_PAGE_FIELDS.filter((f) => !ours?.subscribed_fields?.includes(f));
    if (!ours) problems.push("The Page doesn't pass its messages to the app yet.");
    else if (missing.length > 0) problems.push(`The Page doesn't pass ${missing.join(", ")} to the app.`);
  }

  return { ok: true, page, instagram, problems };
}

export async function connectMetaWebhooks(
  callbackUrl: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  const secret = metaAppSecret();
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN is not set on this deployment." };
  if (!secret) return { ok: false, error: "META_APP_SECRET is not set on this deployment." };
  if (!verifyToken) return { ok: false, error: "META_WEBHOOK_VERIFY_TOKEN is not set on this deployment." };

  const found = await metaIdentity(token, deps);
  if (!found.ok) return found;
  const { app, page } = found.identity;

  const appAuth = new URLSearchParams({ access_token: `${app.id}|${secret}` }).toString();
  const subscribe = (object: "page" | "instagram", fields: readonly string[]) =>
    graphCall(
      `/${app.id}/subscriptions`,
      appAuth,
      { method: "POST", form: { object, callback_url: callbackUrl, fields: fields.join(","), verify_token: verifyToken } },
      deps,
    );

  const facebook = await subscribe("page", META_PAGE_FIELDS);
  if (!facebook.ok) return { ok: false, error: `Facebook webhook: ${facebook.error}` };
  const pageSub = await graphCall(
    `/${page.id}/subscribed_apps`,
    `subscribed_fields=${META_PAGE_FIELDS.join(",")}&${authQuery(token)}`,
    { method: "POST" },
    deps,
  );
  if (!pageSub.ok) return { ok: false, error: `Page subscription: ${pageSub.error}` };
  const instagram = await subscribe("instagram", META_INSTAGRAM_FIELDS);
  if (!instagram.ok) return { ok: false, error: `Instagram webhook (Facebook is connected): ${instagram.error}` };
  return { ok: true };
}
