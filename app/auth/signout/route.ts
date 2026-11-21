import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import { safeNextPath } from "@/lib/auth/post-auth-redirect";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getRequestOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const safeNext = safeNextPath(searchParams.get("next"), `/${DEFAULT_LOCALE}`);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.redirect(`${origin}${safeNext}`, { status: 303 });
}
