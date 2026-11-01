import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { completeSignIn } from "@/lib/auth/complete-sign-in";
import {
  readSignInIntent,
  signInErrorPath,
  SIGN_UP_NOTICE_COOKIE,
  SIGN_UP_NOTICE_MAX_AGE,
} from "@/lib/auth/sign-in-intent";
import { getRequestOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Completes Google and the emailed link (PKCE). Supabase redirects here with a
 * `code`, which is exchanged for a session cookie in this browser. The sign-in
 * link's return address carries the intent (`next`, `as`, `consent`, `lang`;
 * lib/auth/sign-in-intent.ts), and `completeSignIn` does the rest: the Staff
 * check, the Customer, the consent.
 *
 * A link opened in another browser has no PKCE verifier here and fails; the
 * same email's 6-digit code works anywhere, and the scanner-safe link
 * (`/auth/confirm`) does too once the templates use it.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const intent = readSignInIntent(searchParams);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}${signInErrorPath(intent, /expired|invalid/i.test(error) ? "link_expired" : "failed")}`);
  }
  if (!code) return NextResponse.redirect(`${origin}${intent.next}`);

  const supabase = await createSupabaseServerClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data.user) {
    console.error("[auth/callback] exchange failed:", exchangeError?.message ?? "no user");
    return NextResponse.redirect(`${origin}${signInErrorPath(intent, "link_expired")}`);
  }

  const outcome = await completeSignIn(data.user, intent);
  const res = NextResponse.redirect(`${origin}${outcome.destination}`);
  if (outcome.ok && outcome.notice) {
    res.cookies.set(SIGN_UP_NOTICE_COOKIE, outcome.notice, { path: "/", maxAge: SIGN_UP_NOTICE_MAX_AGE, sameSite: "lax" });
  }
  return res;
}
