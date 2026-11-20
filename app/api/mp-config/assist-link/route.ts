import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { adminUserIdForAuthUser, ensureAssistCode } from "@/lib/assist-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const ctx = await getAdminContext();
  const adminUserId = ctx ? await adminUserIdForAuthUser(ctx.userId) : null;
  if (!adminUserId) {
    return NextResponse.json({ error: "No staff record for this session" }, { status: 403 });
  }

  const code = await ensureAssistCode(adminUserId);
  if (!code) {
    return NextResponse.json({ error: "Could not create an assist link" }, { status: 500 });
  }
  return NextResponse.json({ code });
}
