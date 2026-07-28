import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export const runtime = "nodejs";

/**
 * One-click hide from the Staff notification email. The admin guard is the
 * security boundary: only a signed-in Staff member with page-builder access can
 * flip a partner listing off, then lands on the Locations admin page.
 */
export async function GET(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const partnerId = new URL(req.url).searchParams.get("partner");
  if (!partnerId) return NextResponse.json({ error: "Missing partner" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("partners")
    .update({ visible: false })
    .eq("id", partnerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(
    new URL(withLocale("/settings/partners", DEFAULT_LOCALE), getSiteOrigin()),
  );
}
