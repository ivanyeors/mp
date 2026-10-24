import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin";
import { tiktokAuthorizeUrl } from "@/lib/social-inbox/tiktok";
import {
  TIKTOK_COOKIE_PATH,
  TIKTOK_STATE_COOKIE,
  settingsReturnUrl,
  tiktokRedirectUri,
} from "@/lib/social-inbox/tiktok-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings → Users & permissions → Telegram → "Connect TikTok": sends the
 * admin to TikTok to approve the app for the business account. A random state
 * rides in an httpOnly cookie and must come back unchanged to the callback.
 * Owners/admins only, like the rest of the tab.
 */
export async function GET(req: Request) {
  try {
    await requireAdminContext("users");
  } catch (res) {
    return res as NextResponse;
  }

  const state = randomBytes(24).toString("hex");
  const authorizeUrl = tiktokAuthorizeUrl(state, tiktokRedirectUri(req));
  if (!authorizeUrl) {
    return NextResponse.redirect(
      settingsReturnUrl(req, { tiktok: "error", reason: "TIKTOK_APP_ID and TIKTOK_APP_SECRET are not set on this deployment." }),
    );
  }

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(TIKTOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TIKTOK_COOKIE_PATH,
    maxAge: 600,
  });
  return res;
}
