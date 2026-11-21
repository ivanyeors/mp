import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readReviewTab } from "@/lib/crm/google-review-match-server";
import { parseReviewTabScope } from "@/lib/crm/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const scope = parseReviewTabScope(params.get("scope"));
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  try {
    const data = await readReviewTab(supabaseAdmin(), { scope, page: Number.isFinite(page) && page > 0 ? page : 1 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load Google reviews" }, { status: 500 });
  }
}
