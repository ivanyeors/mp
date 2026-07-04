import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getRequestOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Signs the current user out and clears the session cookie. Accepts an
 * optional `next` redirect target (defaults to the locale home). Works for
 * both shopper and staff sessions since there is a single Supabase Auth user.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const next = searchParams.get("next") ?? `/${DEFAULT_LOCALE}`;
  const safeNext = next.startsWith("/") ? next : `/${DEFAULT_LOCALE}`;

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(`${origin}${safeNext}`, { status: 303 });
}
