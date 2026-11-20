import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { actingProfile } from "@/lib/staff/working-as";
import { parseFollowUpScope, sgtToday } from "@/lib/crm/followup-rules";
import { listAssignableProfiles, listFollowUps } from "@/lib/crm/followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = parseFollowUpScope(new URL(req.url).searchParams.get("scope"));
  const today = sgtToday();
  try {
    const me = await actingProfile(ctx.memberId);
    const [list, assignees] = await Promise.all([
      listFollowUps({ scope, profileId: me?.id ?? null, today }),
      hasPermission(ctx, "customers-edit") ? listAssignableProfiles() : Promise.resolve([]),
    ]);
    return NextResponse.json({ ok: true, scope, ...list, today, me, assignees });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load follow-ups" }, { status: 500 });
  }
}
