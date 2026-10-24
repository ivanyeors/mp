import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth/admin";

export const runtime = "nodejs";

/**
 * Returns the current staff member's RBAC context for the settings UI: whether
 * they are an authorized, active admin and which pages their role grants
 * (read from `admin_roles` on this request). The back-office nav uses this to gate access and hide areas the role
 * cannot reach. Always 200 so the client can branch on `signedIn`.
 */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) {
    return NextResponse.json({ signedIn: false, role: null, permissions: [] });
  }
  return NextResponse.json({
    signedIn: true,
    role: ctx.roleKey,
    permissions: [...ctx.permissions],
  });
}
