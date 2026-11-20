import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { decodeCursor, encodeCursor } from "@/lib/crm/timeline/cursor";
import { loadTimeline, TIMELINE_PAGE_SIZE } from "@/lib/crm/timeline/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const rawBefore = search.get("before");
  const after = rawBefore ? decodeCursor(rawBefore) : null;
  if (rawBefore && !after) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  const kinds = search.get("kinds");
  const groups = kinds ? new Set(kinds.split(",").map((k) => k.trim()).filter(Boolean)) : null;
  const requested = Number(search.get("limit") ?? TIMELINE_PAGE_SIZE);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), TIMELINE_PAGE_SIZE) : TIMELINE_PAGE_SIZE;

  const { data: customer, error } = await supabaseAdmin()
    .from("customers")
    .select("id, email")
    .eq("id", id)
    .maybeSingle<{ id: string; email: string | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const page = await loadTimeline({ customer, viewer: ctx, groups, after, limit });
  return NextResponse.json({
    ok: true,
    entries: page.entries,
    next: page.next ? encodeCursor(page.next) : null,
    groups: page.groups,
    unavailable: page.unavailable,
  });
}
