import { NextResponse } from "next/server";
import { z } from "zod";
import { syncProductToStripe } from "@/lib/stripe/sync";

export const runtime = "nodejs";

const SyncProductSchema = z.object({
  product_id: z.string().uuid(),
});

export async function POST(req: Request) {
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
