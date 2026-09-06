import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { checkGoogleStatus } from "@/lib/appointments/google-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/appointments/google-status — admin-only health check for the
 * admin@mpillow.com OAuth grant (scopes + live Calendar / People probes). Never
 * returns the token itself. `nextStep` names the fix when something is wrong.
 */
export async function GET() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const status = await checkGoogleStatus();
  return NextResponse.json(status, { status: 200 });
}
