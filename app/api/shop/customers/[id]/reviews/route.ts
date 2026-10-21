import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readCustomerReviews } from "@/lib/crm/google-review-match-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/shop/customers/[id]/reviews — the Customer detail's Reviews card
 * (CRM slice 12): their Linked Google reviews, Shop reviews, Review request,
 * and the unlinked Google reviews suggested for them. Seeing it needs
 * `customers`; *Link*, *Not them* and *Unlink* are `customers-edit` routes
 * under /api/settings/customers/google-reviews.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  try {
    return NextResponse.json(await readCustomerReviews(supabaseAdmin(), id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load reviews" }, { status: 500 });
  }
}
