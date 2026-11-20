import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { requireAnyAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Permission } from "@/lib/auth/permissions";
import { secretMatches } from "@/lib/auth/secret";
import { isCustomersResult } from "@/lib/results/owner";

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

  return isCustomersResult(customer, row);
}

export type ResultAccess =
  | { ok: true; mode: "staff" | "owner" }
  | { ok: false; response: NextResponse };

export async function requireResultAccess(
  row: {
    access_token: string | null;
    customer_id: string | null;
    customer_email: string | null;
    status: string | null;
    order_id: string | null;
  },
  token: string | null,
  opts?: {
    draftOnly?: boolean;
    staffPermissions?: Permission[];
  },
): Promise<ResultAccess> {
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
