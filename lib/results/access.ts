import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { requireAnyAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Permission } from "@/lib/auth/permissions";
import { secretMatches } from "@/lib/auth/secret";
import { isCustomersResult } from "@/lib/results/owner";

/** Guest magic-link token or signed-in customer matching the Result. */
export async function authorizeResultAccess(
  row: {
    access_token: string | null;
    customer_id: string | null;
    customer_email: string | null;
  },
  token: string | null,
): Promise<boolean> {
  if (secretMatches(row.access_token ?? undefined, token ?? null)) return true;

  const user = await getAuthUser();
  if (!user) return false;

  const admin = supabaseAdmin();
  const { data: customer } = await admin
    .from("customers")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) return false;

  // Shared with the Customer timeline, so the two can never disagree.
  return isCustomersResult(customer, row);
}

export type ResultAccess =
  | { ok: true; mode: "staff" | "owner" }
  | { ok: false; response: NextResponse };

/**
 * The gate for routes that serve both Staff and the shopper — the mp-config
 * endpoints, which the guest configurator calls and `requireAdmin` would refuse.
 *
 * Reports *which* audience was recognised, because the payload differs by
 * audience: Staff get the full record, an Owner gets a redacted projection.
 * Deriving that a second time at the call site is how the two would drift.
 */
export async function requireResultAccess(
  row: {
    access_token: string | null;
    customer_id: string | null;
    customer_email: string | null;
    status: string | null;
    /** Required so a caller cannot forget it and silently keep the legacy allowance. */
    order_id: string | null;
  },
  token: string | null,
  opts?: {
    /**
     * Writes only. Once a Result enters the money path its status is non-null
     * and it is Staff-only — its own Owner included. Reads stay open to the
     * Owner, who still needs to see their build after the hold.
     */
    draftOnly?: boolean;
    /**
     * Which Staff count as Staff here. The default admits every admin role —
     * `viewer` included, since it carries `orders`. A route that rewrites a
     * customer's Result narrows it to `results`.
     */
    staffPermissions?: Permission[];
  },
): Promise<ResultAccess> {
  // Every admin role carries `orders`, so this also admits Staff assist mode
  // running the configurator on the shared in-store device.
  const denied = await requireAnyAdmin(opts?.staffPermissions ?? ["results", "orders"]);
  if (!denied) return { ok: true, mode: "staff" };

  const owner =
    (await authorizeResultAccess(row, token)) ||
    // ponytail: temporary legacy allowance — delete with the access_token
    // backfill. A Draft Result created before tokens were minted at create has
    // neither a token nor a status. Its owner's browser has nothing to prove
    // ownership with, and minting one on their next write would lock out the
    // very session it just let through. Drafts carry no money and age out, so
    // they stay open until the backfill closes them. An order-linked row is not
    // a Draft: order sync and Staff create those tokenless and permanent.
    (row.access_token == null && row.status == null && row.order_id == null);

  if (owner) {
    // The Draft Result guard (CONTEXT.md), in one place rather than at each
    // write site. Without it, knowing a Result id was enough to rewrite the
    // measurements behind an already-built pillow, or to point customer_email at
    // yourself on a `held` row and receive the assign email carrying that
    // Result's access token.
    if (opts?.draftOnly && row.status != null) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "This Result is no longer editable" },
          { status: 403 },
        ),
      };
    }
    return { ok: true, mode: "owner" };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}
