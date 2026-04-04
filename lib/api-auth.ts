import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SETTINGS_SESSION_COOKIE, validateSession } from "@/lib/settings-auth";

/**
 * Validates that the request comes from an authenticated settings admin.
 * Returns null if authenticated, or a 401 NextResponse if not.
 *
 * Usage in API route handlers:
 *   const denied = await requireSettingsAuth();
 *   if (denied) return denied;
 */
export async function requireSettingsAuth(): Promise<NextResponse | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_SESSION_COOKIE)?.value;
  const result = validateSession(token);

  if (!result.valid) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
