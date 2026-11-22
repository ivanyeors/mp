import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  COLLECT_FLAT_ERROR,
  collectIsFlat,
  COURIER_PIN_ERROR,
  CountriesField,
  courierPinned,
  LiveRateFields,
  SelfCollectFields,
} from "@/lib/shipping/method-schema";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { isSelfCollect } from "@/lib/shipping/self-collect";
import { getLocations } from "@/lib/locations";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";

const CreateShippingMethodSchema = z.object({
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  content: z.record(z.string(), z.unknown()).default({}),
  base_rate: z.number().nonnegative(),
  free_above: z.number().nonnegative().nullable().optional().default(null),
  currency: z.string().default("SGD"),
  countries: CountriesField.optional().default(["SG"]),
  is_active: z.boolean().optional().default(true),
  position: z.number().int().nonnegative().optional().default(0),
  ...LiveRateFields,
  ...SelfCollectFields,
}).refine(courierPinned, COURIER_PIN_ERROR)
  .refine(collectIsFlat, COLLECT_FLAT_ERROR);

function shopperView(method: ShippingMethod) {
  const view = { ...method };
  delete view.markup_percent;
  delete view.markup_fixed;
  delete view.rate_rounding;
  return view;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawCountry = searchParams.get("country")?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null;
  const includeInactive = searchParams.get("include_inactive") === "1";
  const adminCtx = includeInactive ? await getAdminContext() : null;
  const canIncludeInactive =
    adminCtx != null && hasPermission(adminCtx, "shipping");

  const collect = searchParams.get("collect") === "1";

  try {
    const all = (await readShippingMethods(canIncludeInactive, country)) as ShippingMethod[];
    if (canIncludeInactive) return NextResponse.json({ ok: true, rows: all });
    const shown = all.map(shopperView);
    if (!collect) return NextResponse.json({ ok: true, rows: shown.filter((m) => !isSelfCollect(m)) });
    const studios = new Map((await getLocations()).map((l) => [l.id, l]));
    const rows = shown.flatMap((m) => {
      if (!isSelfCollect(m)) return [m];
      const studio = studios.get(m.collect_location_id!);
      if (!studio?.address?.trim()) return [];
      return [{ ...m, collect_location: { id: studio.id, name: studio.name, address: studio.address } }];
    });
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateShippingMethodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.from("shipping_methods").insert(parsed.data).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A shipping method with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  invalidateTag("shipping-methods");
  return NextResponse.json({ ok: true, row: data });
}
