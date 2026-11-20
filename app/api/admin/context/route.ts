import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth/admin";

export const runtime = "nodejs";

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
