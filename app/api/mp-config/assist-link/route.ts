import { NextResponse } from "next/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { adminUserIdForAuthUser, ensureAssistCode } from "@/lib/assist-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint-or-return the CALLER'S OWN Assist link code (PRD
 * staff-assisted-customisation, slice 02).
 *
 * There is deliberately no way to ask for another Staff member's code: the
 * route takes no body at all and the id comes from the session. Gated on
 * `results`, the same permission the Results queue an Assist link feeds needs.
 *
 * POST because the first call writes. Every call after that is a read —
 * `ensureAssistCode` returns the code already on the row — which is what keeps
 * the column empty for the Staff who never ask for a link.
 */
export async function POST() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  // Cached per request by getAdminContext, so this is the same round trip the
  // guard above already paid for.
  const ctx = await getAdminContext();
  const adminUserId = ctx ? await adminUserIdForAuthUser(ctx.userId) : null;
  if (!adminUserId) {
    // A bootstrap session whose admin_users row could not be resolved. Refusing
    // beats minting a code against a row we cannot name.
    return NextResponse.json({ error: "No staff record for this session" }, { status: 403 });
  }

  const code = await ensureAssistCode(adminUserId);
  if (!code) {
    return NextResponse.json({ error: "Could not create an assist link" }, { status: 500 });
  }
  return NextResponse.json({ code });
}
