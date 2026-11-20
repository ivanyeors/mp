import { NextResponse } from "next/server";
import { hashReviewToken, isWellFormedReviewToken } from "@/lib/aftercare/review-link";
import { loadReviewRequestSettings } from "@/lib/aftercare/review-request-server";
import { isUsableReviewUrl } from "@/lib/aftercare/review-request";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");

  let target: string | null = null;
  try {
    const admin = supabaseAdmin();
    const [settings] = await Promise.all([
      loadReviewRequestSettings(admin),
      isWellFormedReviewToken(token)
        ? admin.rpc("record_review_request_click", { p_token_hash: hashReviewToken(token) }).then(({ error }) => {
            if (error) console.error("[r/review] click not recorded:", error.message);
          })
        : null,
    ]);
    if (isUsableReviewUrl(settings.googleReviewUrl)) target = settings.googleReviewUrl;
  } catch (e) {
    console.error("[r/review]", e instanceof Error ? e.message : e);
  }

  const res = NextResponse.redirect(target ?? `${getPublicOrigin(req)}/`, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
