import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listShopProducts, setProductListed } from "@/lib/ecommerce/shop-listings";

export const runtime = "nodejs";

const ToggleSchema = z.object({
  product_id: z.string().min(1),
  listed: z.boolean(),
});

export async function GET() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  try {
    const rows = await listShopProducts();
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load products.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const parsed = ToggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = await setProductListed(parsed.data.product_id, parsed.data.listed);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, stripe_warnings: result.stripeWarnings?.length ? result.stripeWarnings : undefined },
      { status: result.status },
    );
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: result.listed ? "product.list_in_shop" : "product.unlist_from_shop",
    entityType: "product",
    entityId: parsed.data.product_id,
  });

  const { stripeWarnings, ...rest } = result;
  return NextResponse.json({
    ...rest,
    stripe_warnings: stripeWarnings.length > 0 ? stripeWarnings : undefined,
  });
}
