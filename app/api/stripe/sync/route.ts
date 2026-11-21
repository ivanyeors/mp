import { NextResponse } from "next/server";
import { z } from "zod";
import { syncProductToStripe } from "@/lib/stripe/sync";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const SyncProductSchema = z.object({
  product_id: z.string().uuid(),
});

export async function POST(req: Request) {
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
      stripeProductId: result.stripeProductId,
      variant_count: result.variants.length,
      variants: result.variants,
      notices: result.notices,
      paymentLinkCleared: result.paymentLinkCleared,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync product to Stripe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
