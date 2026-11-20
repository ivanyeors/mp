import { NextResponse } from "next/server";
import { z } from "zod";
import { createPaymentLink } from "@/lib/stripe/sync";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const PaymentLinkSchema = z.object({
  product_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = PaymentLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createPaymentLink(parsed.data.product_id);
    return NextResponse.json({
      ok: true,
      payment_link_url: result.url,
      payment_link_id: result.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create payment link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
