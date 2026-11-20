import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { checkGoogleStatus } from "@/lib/appointments/google-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin("appointments");
  if (denied) return denied;

  const status = await checkGoogleStatus();
  return NextResponse.json(status, { status: 200 });
}
