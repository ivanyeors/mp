import { NextResponse } from "next/server";
import { hashReviewToken, isWellFormedReviewToken } from "@/lib/aftercare/review-link";
import { loadReviewRequestSettings } from "@/lib/aftercare/review-request-server";
import { isUsableReviewUrl } from "@/lib/aftercare/review-request";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /r/review?t=<token> — the Review request's button (CRM slice 07), in the
 * email and on WhatsApp. It records the click, then sends the visitor on to
 * the Google review form (`google_review_url`).
 *
 * Never an error page. A missing, malformed or unknown token is sent on to
 * Google exactly like a valid one and records nothing, so the response says
 * nothing about which tokens exist. The token carries no PII, and the response
 * is `noindex`. A click is a hint, not proof: mail scanners prefetch links.
 *
 * Outside the locale proxy (proxy.ts), so it is one hop to Google.
 */
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

  // With no usable review link configured, the home page rather than an error.
  const res = NextResponse.redirect(target ?? `${getPublicOrigin(req)}/`, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
