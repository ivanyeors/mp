/**
 * Facebook / Instagram / TikTok customer messages → Telegram: setup and
 * diagnostics (.claude/PRD-social-inbox/OPS-CHECKLIST.md). Users & permissions
 * → Telegram shows the same Meta check and has a button for step 2; this is
 * the same thing from a terminal.
 *
 *   # 1. Check the Page token and app secret, find the Page and Instagram ids,
 *   #    and list what still keeps messages from arriving:
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts
 *
 *   # 2. Point the Meta app's Page and Instagram webhooks at the site and
 *   #    subscribe the Page (Meta checks the URL with META_WEBHOOK_VERIFY_TOKEN,
 *   #    so it must match what that site has):
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --meta-webhook https://custom.mpillow.com/api/webhooks/meta-messages
 *
 *   # 3. Point TikTok's DIRECT_MESSAGE webhook at the site (the TikTok connect
 *   #    button does this on production; use this to repair or check it):
 *   npx tsx --env-file=.env.local scripts/social-inbox-setup.ts --tiktok-webhook https://custom.mpillow.com/api/webhooks/tiktok-messages
 *
 * Needs META_PAGE_ACCESS_TOKEN for 1–2, TIKTOK_APP_ID / TIKTOK_APP_SECRET for 3.
 * Read-only unless --meta-webhook or --tiktok-webhook is given.
 */
import { checkMetaSetup, connectMetaWebhooks } from "@/lib/social-inbox/meta";

type Json = Record<string, unknown>;

const TIKTOK = `https://business-api.tiktok.com/open_api/${process.env.TIKTOK_API_VERSION?.trim() || "v1.3"}`;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
}

async function meta(webhookUrl: string | null): Promise<void> {
  if (!process.env.META_PAGE_ACCESS_TOKEN?.trim()) {
    console.log("• Meta: META_PAGE_ACCESS_TOKEN is not set — skipping Facebook/Instagram.");
    return;
  }
  if (webhookUrl) {
    const connected = await connectMetaWebhooks(webhookUrl);
    if (!connected.ok) throw new Error(connected.error);
    console.log(`• Meta webhooks set to ${webhookUrl}; Page subscribed.`);
  }
  const setup = await checkMetaSetup(webhookUrl);
  if (!setup) return;
  if (!setup.ok) throw new Error(setup.error);
  console.log(`• Facebook Page: ${setup.page.name ?? "?"} (${setup.page.id})`);
  console.log(`  META_PAGE_ID=${setup.page.id}`);
  if (setup.instagram) {
    console.log(`• Instagram: @${setup.instagram.username ?? "?"} (${setup.instagram.id})`);
    console.log(`  INSTAGRAM_ACCOUNT_ID=${setup.instagram.id}`);
  } else {
    console.log("• Instagram: no professional account is linked to this Page (Meta Business Suite → Settings → Instagram accounts).");
  }
  if (setup.problems.length === 0) console.log("• Webhooks and Page subscription: all set.");
  for (const problem of setup.problems) console.log(`✗ ${problem}`);
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
  const metaWebhook = arg("--meta-webhook");
  if (metaWebhook === "") throw new Error("--meta-webhook needs a URL");
  const tiktokWebhook = arg("--tiktok-webhook");
  if (tiktokWebhook === "") throw new Error("--tiktok-webhook needs a URL");
  await meta(metaWebhook);
  await tiktok(tiktokWebhook);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
