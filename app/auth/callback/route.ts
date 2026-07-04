import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getRequestOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Completes the OAuth / magic-link exchange. Supabase redirects here with a
 * `code` (PKCE) which we exchange for a session cookie, then forwards the user
 * to `next` (defaults to the locale-prefixed home).
 *
 * Used by both shoppers (account login) and staff (settings login). The
 * `next` param controls the post-login destination.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${DEFAULT_LOCALE}`;
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  const safeNext = next.startsWith("/") ? next : `/${DEFAULT_LOCALE}`;

  if (error) {
    return NextResponse.redirect(
      `${origin}${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(error)}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    return NextResponse.redirect(
      `${origin}${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
