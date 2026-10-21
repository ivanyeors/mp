import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { actingProfile } from "@/lib/staff/working-as";
import { sgtToday } from "@/lib/crm/followup-rules";
import { countDueFollowUps } from "@/lib/crm/followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/customers/followup-counts — the Customers sidebar badge
 * (CRM slice 06), following the Results badge: the open follow-ups assigned to
 * the profile the viewer works as that are due today, and overdue (due before
 * today in Singapore). Needs `customers`.
 *
 * Answers `{ ok, profile, counts }`. On a shared login where nobody has chosen
 * who they are working as, `profile` and `counts` are null and the badge
 * shows nothing: whose list it would be is not known.
 */
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
