import { NextResponse } from "next/server";
import { z } from "zod";
import { syncProductToStripe } from "@/lib/stripe/sync";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const SyncProductSchema = z.object({
  product_id: z.string().uuid(),
});

export async function POST(req: Request) {
  // Staff-only: the sole remaining caller is the Admin Panel product editor,
  // which already sits behind requireAdminPage("products"). Ungated, anyone with
  // a product id could force Stripe Product/Price writes and burn API quota.
  // scripts/stripe-sync-all.ts used to POST here; it now calls
  // syncProductToStripe() directly and needs no running app at all.
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = SyncProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await syncProductToStripe(parsed.data.product_id);
    return NextResponse.json({
      ok: true,
      stripe_product_id: result.stripe_product_id,
      variant_count: result.variants.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync product to Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
