import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { buildParcels } from "@/lib/shipping/parcels";
import { readTypeBoxes } from "@/lib/easyship/store";
import { fetchCourierRates, priceMethod } from "@/lib/shipping/quote";
import { parseShippingSettings, ShippingSettingsSchema } from "@/lib/shipping/settings";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";

const TestSchema = z.object({
  destination: z.object({
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    postal_code: z.string().trim().min(2).max(12),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
  }),
  profile: z.enum(["pillow", "bolster", "accessory"]).default("pillow"),
  quantity: z.number().int().min(1).max(10).default(1),
  /** The unsaved form, so Staff can try settings before saving them. Defaults to the saved row. Boxes are always the saved doc's. */
  settings: ShippingSettingsSchema.optional(),
});

/**
 * Settings → Shipping "Test a quote": today's live rates for a sample parcel,
 * every courier with what it costs us, and what each active method would charge.
 * Always fresh — this is how Staff find a courier service id to pin.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const parsed = TestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { destination, profile, quantity } = parsed.data;
  const admin = supabaseAdmin();

  let settings = parsed.data.settings ? parseShippingSettings(parsed.data.settings) : null;
  if (!settings) {
    const { data, error } = await admin.from("shipping_settings").select("*").eq("id", true).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = parseShippingSettings(data as Record<string, unknown> | null);
  }

  const methods = ((await readShippingMethods(false, destination.country).catch(() => [])) as ShippingMethod[]);
  const currency = methods.find((m) => m.rate_source === "easyship")?.currency ?? methods[0]?.currency ?? "SGD";
  const parcels = buildParcels(
    [
      {
        product_type: profile,
        quantity,
        weight_grams: null,
        unit_value: settings.estimate_declared_value,
        currency,
        description: "Test parcel",
      },
    ],
    await readTypeBoxes(),
  );

  const rates = await fetchCourierRates(admin, {
    settings,
    destination,
    parcels,
    currency,
    fresh: true,
  });
  if (!rates.ok) {
    return NextResponse.json({ ok: false, reason: rates.reason, error: rates.message, parcels });
  }

  return NextResponse.json({
    ok: true,
    parcels,
    rates: [...rates.rates].sort((a, b) => a.total_charge - b.total_charge),
    methods: methods.map((m) => {
      const option = priceMethod(m, rates, 0, settings.handling_days);
      return {
        method_id: m.id,
        slug: m.slug,
        rate_source: m.rate_source ?? "flat",
        available: option !== null,
        price: option?.amount ?? null,
        courier: option?.courier?.name ?? null,
        carrier_cost: option?.carrier_cost ?? null,
      };
    }),
  });
}
