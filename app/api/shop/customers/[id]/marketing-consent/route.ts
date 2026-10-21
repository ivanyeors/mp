import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, requireAdminContext, type AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { readMarketingConsentView, setMarketingEmail } from "@/lib/marketing-consent/consent";

export const runtime = "nodejs";

/**
 * A Customer's Marketing consent (PRD-shopify-customer-migration slice 07):
 * the state, its source and date, and every change. Seeing it needs
 * `customers`.
 *
 * Staff read consent and do not set it, so the history stays the customer's
 * own. The one exception is a support request to stop: POST unsubscribes, with
 * source `support`, and needs `customers-edit`. There is no way here to
 * subscribe anyone.
 */

const UnsubscribeSchema = z.object({ action: z.literal("unsubscribe") }).strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  try {
    const view = await readMarketingConsentView(supabaseAdmin(), id);
    if (!view) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read marketing consent" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: AdminContext;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (denied) {
    return denied as NextResponse;
  }

  const { id } = await params;
  const parsed = UnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Staff can only unsubscribe a customer who asks" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const result = await setMarketingEmail(admin, { customerId: id, to: "unsubscribed", source: "support" });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 400 });
  }

  if (result.changed) {
    await recordAdminAction({
      actor: ctx,
      action: "customer.marketing_unsubscribe",
      entityType: "customer",
      entityId: id,
      after: { marketing_email: "unsubscribed", source: "support" },
    });
  }

  const view = await readMarketingConsentView(admin, id).catch(() => null);
  return NextResponse.json({ ok: true, changed: result.changed, view });
}
