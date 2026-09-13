import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { listShopListingFamilies, setFamilyListed } from "@/lib/ecommerce/shop-listings";

export const runtime = "nodejs";

const ToggleSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1),
  listed: z.boolean(),
});

/** Listable inventory families, with whether each is currently in the shop. */
export async function GET() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  try {
    const rows = await listShopListingFamilies();
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list inventory";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Put one family in the shop, or take it out. */
export async function PATCH(req: Request) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await setFamilyListed(parsed.data.item_ids, parsed.data.listed);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, action: result.action });
}
