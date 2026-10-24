/**
 * Facebook / Instagram / TikTok customer messages → Telegram: setup and
 * diagnostics (.claude/PRD-social-inbox/OPS-CHECKLIST.md).
 *
 *   # 1. Check the Page token, find the Page and Instagram ids, see what the
 *   #    Page is subscribed to:
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts
 *
 *   # 2. Subscribe the Page to this app's message webhooks (Messenger and
 *   #    Instagram DMs both need it):
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --subscribe
 *
 *   # 3. Point TikTok's DIRECT_MESSAGE webhook at the site (the TikTok connect
 *   #    button does this on production; use this to repair or check it):
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --tiktok-webhook https://custom.mpillow.com/api/webhooks/tiktok-messages
 *
 * Needs META_PAGE_ACCESS_TOKEN for 1–2, TIKTOK_APP_ID / TIKTOK_APP_SECRET for 3.
 * Read-only unless --subscribe or --tiktok-webhook is given.
 */
import { createHmac } from "node:crypto";

type Json = Record<string, unknown>;

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v24.0"}`;
const TIKTOK = `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION?.trim() || "v1.3"}`;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
}

function graphUrl(path: string, token: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...params, access_token: token });
  const secret = process.env.META_APP_SECRET?.trim();
  if (secret) q.set("appsecret_proof", createHmac("sha256", secret).update(token).digest("hex"));
  return `${GRAPH}${path}?${q}`;
}

async function graph(url: string, method = "GET"): Promise<Json> {
  const res = await fetch(url, { method });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok || json.error) {
    const e = (json.error ?? {}) as { message?: string; code?: number };
    throw new Error(`${res.status} ${e.message ?? ""}${e.code ? ` (#${e.code})` : ""}`.trim());
  }
  return json;
}

async function meta(subscribe: boolean): Promise<void> {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!token) {
    console.log("• Meta: META_PAGE_ACCESS_TOKEN is not set — skipping Facebook/Instagram.");
    return;
  }
  const me = (await graph(graphUrl("/me", token, { fields: "id,name,instagram_business_account{id,username}" }))) as {
    id?: string;
    name?: string;
    instagram_business_account?: { id?: string; username?: string };
  };
  if (!me.id) throw new Error("The token did not resolve to a Page — use a Page access token, not a user token.");
  console.log(`• Facebook Page: ${me.name} (${me.id})`);
  console.log(`  META_PAGE_ID=${me.id}`);
  const ig = me.instagram_business_account;
  if (ig?.id) {
    console.log(`• Instagram: @${ig.username ?? "?"} (${ig.id})`);
    console.log(`  INSTAGRAM_ACCOUNT_ID=${ig.id}`);
  } else {
    console.log("• Instagram: no professional account is linked to this Page (Meta Business Suite → Settings → Instagram accounts).");
  }

  if (subscribe) {
    await graph(
      graphUrl(`/${me.id}/subscribed_apps`, token, {
        subscribed_fields: "messages,message_echoes,messaging_postbacks",
      }),
      "POST",
    );
    console.log("• Subscribed the Page to messages, message_echoes and messaging_postbacks.");
  }
  const subs = (await graph(graphUrl(`/${me.id}/subscribed_apps`, token))) as {
    data?: { name?: string; id?: string; subscribed_fields?: string[] }[];
  };
  const apps = subs.data ?? [];
  if (apps.length === 0) console.log("• The Page is not subscribed to any app yet — run again with --subscribe.");
  for (const app of apps) {
    console.log(`• Page → app ${app.name ?? app.id}: ${(app.subscribed_fields ?? []).join(", ") || "(no fields)"}`);
  }
}

async function tiktok(webhookUrl: string | null): Promise<void> {
  const appId = process.env.TIKTOK_APP_ID?.trim();
  const secret = process.env.TIKTOK_APP_SECRET?.trim();
  if (!appId || !secret) {
    console.log("• TikTok: TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set — skipping.");
    return;
  }
  const call = async (path: string, init: { method: "GET" | "POST"; query?: Record<string, string>; body?: Json }) => {
    const url = new URL(`${TIKTOK}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method: init.method,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string; data?: Json };
    if (!res.ok || json.code !== 0) throw new Error(`TikTok ${path}: ${json.message ?? res.status} (${json.code ?? "?"})`);
    return json.data ?? {};
  };

  if (webhookUrl) {
    await call("/business/webhook/update/", {
      method: "POST",
      body: { app_id: appId, secret, event_type: "DIRECT_MESSAGE", callback_url: webhookUrl },
    });
    console.log(`• TikTok webhook set to ${webhookUrl}`);
  }
  const current = await call("/business/webhook/list/", {
    method: "GET",
    query: { app_id: appId, secret, event_type: "DIRECT_MESSAGE" },
  });
  console.log(`• TikTok DIRECT_MESSAGE webhook: ${JSON.stringify(current)}`);
}

async function main(): Promise<void> {
  const tiktokWebhook = arg("--tiktok-webhook");
  if (tiktokWebhook === "") throw new Error("--tiktok-webhook needs a URL");
  await meta(process.argv.includes("--subscribe"));
  await tiktok(tiktokWebhook);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
