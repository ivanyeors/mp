import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { getAdminContext } from "@/lib/auth/admin";
import { resolvePostAuthRedirect } from "@/lib/auth/post-auth-redirect";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getRequestOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Completes the OAuth / magic-link exchange. Supabase redirects here with a
 * `code` (PKCE) which we exchange for a session cookie, then forwards the user
 * via {@link resolvePostAuthRedirect} (staff default → Admin Panel; non-staff
 * blocked from `/settings` next).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${DEFAULT_LOCALE}`;
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : `/${DEFAULT_LOCALE}`;
  const locale = getLocaleFromPathname(safeNext) ?? DEFAULT_LOCALE;
  const accountHome = withLocale("/account", locale);
  const adminHome = withLocale("/settings", locale);

  if (error) {
    return NextResponse.redirect(
      `${origin}${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(error)}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      const destination = resolvePostAuthRedirect({
        next: safeNext,
        isStaff: Boolean(await getAdminContext()),
        accountHome,
        adminHome,
      });
      return NextResponse.redirect(`${origin}${destination}`);
    }
    return NextResponse.redirect(
      `${origin}${safeNext}${safeNext.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
