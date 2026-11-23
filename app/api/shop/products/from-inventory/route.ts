import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCanSeeCost, getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { familiesWithoutCost } from "@/lib/ecommerce/inventory-families";
import { listInventoryFamilies, pushFamilyToProducts } from "@/lib/ecommerce/shop-listings";

export const runtime = "nodejs";

const cents = z.number().int().min(0);

const PushSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1),
  prices: z
    .array(z.object({ item_id: z.number().int().positive(), cost_cents: cents.nullable().optional(), msrp_cents: cents }))
    .min(1),
});

export async function GET() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  try {
    const [families, canSeeCost] = await Promise.all([listInventoryFamilies(), adminCanSeeCost()]);
    const rows = canSeeCost ? families : familiesWithoutCost(families);
    return NextResponse.json({ ok: true, rows, can_see_cost: canSeeCost });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load inventory.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const parsed = PushSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const result = await pushFamilyToProducts(
    parsed.data.item_ids,
    parsed.data.prices.map((p) => ({ itemId: p.item_id, costCents: p.cost_cents ?? null, msrpCents: p.msrp_cents })),
    await adminCanSeeCost(),
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, reason: result.reason },
      { status: result.status },
    );
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: result.created ? "product.push_from_inventory" : "product.add_sizes_from_inventory",
    entityType: "product",
    entityId: result.productId,
    after: { item_ids: parsed.data.item_ids, prices: parsed.data.prices, added: result.added },
  });

  const { stripeWarnings, ...rest } = result;
  return NextResponse.json({
    ...rest,
    stripe_warnings: stripeWarnings.length > 0 ? stripeWarnings : undefined,
  });
}
