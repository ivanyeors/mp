import { NextResponse, type NextRequest } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { secretMatches } from "@/lib/auth/secret";
import {
  exchangeTikTokCode,
  fetchTikTokAccountName,
  registerTikTokWebhook,
  saveTikTokConnection,
} from "@/lib/social-inbox/tiktok";
import {
  TIKTOK_COOKIE_PATH,
  TIKTOK_STATE_COOKIE,
  settingsReturnUrl,
  tiktokRedirectUri,
  tiktokWebhookUrl,
} from "@/lib/social-inbox/tiktok-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TikTok sends the admin back here with a one-time code. Exchange it, store
 * the tokens (social_channel_tokens), and — on the production deployment only,
 * so a preview can never steal the live webhook — point TikTok's message
 * webhook at this site. Then back to the Telegram access tab with the outcome.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireAdminContext("staff");
  } catch (res) {
    return res as NextResponse;
  }

  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(settingsReturnUrl(req, params));
    res.cookies.set(TIKTOK_STATE_COOKIE, "", { path: TIKTOK_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return back({ tiktok: "error", reason: url.searchParams.get("error_description") || error });
  }
  if (!secretMatches(req.cookies.get(TIKTOK_STATE_COOKIE)?.value, url.searchParams.get("state"))) {
    return back({ tiktok: "error", reason: "The sign-in link expired or was opened in another browser. Try Connect TikTok again." });
  }
  const code = url.searchParams.get("code");
  if (!code) return back({ tiktok: "error", reason: "TikTok did not return a code." });

  const exchanged = await exchangeTikTokCode(code, tiktokRedirectUri(req));
  if (!exchanged.ok) return back({ tiktok: "error", reason: exchanged.error });
  const tokens = exchanged.tokens;

  const accountName = await fetchTikTokAccountName(tokens.accountId, tokens.accessToken);
  await saveTikTokConnection(tokens, { accountName, connectedBy: ctx.email ?? null });

  let webhook: "registered" | "skipped" | string = "skipped";
  if (process.env.VERCEL_ENV === "production") {
    const registered = await registerTikTokWebhook(tiktokWebhookUrl(req));
    webhook = registered.ok ? "registered" : registered.error;
  }

  await recordAdminAction({
    actor: ctx,
    action: "social_inbox.tiktok_connect",
    entityType: "social_channel",
    entityId: "tiktok",
    after: { account_id: tokens.accountId, account_name: accountName, scope: tokens.scope, webhook },
  });

  return back({
    tiktok: "connected",
    ...(accountName ? { account: accountName } : {}),
    webhook: webhook === "registered" || webhook === "skipped" ? webhook : `failed: ${webhook}`,
  });
}
