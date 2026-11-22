import { NextResponse } from "next/server";
import { z } from "zod";
import { syncProductToStripeSafe } from "@/lib/stripe/sync";
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

  const outcome = await syncProductToStripeSafe(parsed.data.product_id);
  const { pricesInPlace, notices } = outcome;
  if (!outcome.result) {
    return NextResponse.json(
      {
        error: outcome.error ?? "Failed to sync product to Stripe",
        pricesInPlace,
        notices,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    stripeProductId: outcome.result.stripeProductId,
    variant_count: outcome.result.variants.length,
    variants: outcome.result.variants,
    pricesInPlace,
    notices,
  });
}
