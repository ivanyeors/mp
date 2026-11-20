import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { actingProfile } from "@/lib/staff/working-as";
import { sgtToday } from "@/lib/crm/followup-rules";
import { countDueFollowUps } from "@/lib/crm/followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profile = await actingProfile(ctx.memberId);
    if (!profile) return NextResponse.json({ ok: true, profile: null, counts: null });
    const counts = await countDueFollowUps(profile.id, sgtToday());
    return NextResponse.json({ ok: true, profile, counts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to count follow-ups" }, { status: 500 });
  }
}
