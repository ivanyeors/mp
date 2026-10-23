import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { loadShippableLines } from "@/lib/shipping/lines";
import { quoteShippingMethods } from "@/lib/shipping/quote";
import { isSelfCollect } from "@/lib/shipping/self-collect";
import { DEFAULT_SHIPPING_SETTINGS, readShippingSettings } from "@/lib/shipping/settings";
import type { ShippableLine, ShippingQuoteResponse } from "@/lib/shipping/types";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";

const QuoteSchema = z
  .object({
    /** A cart: priced from the variants in the database, never from client prices. */
    items: z
      .array(z.object({ variant_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) }))
      .max(50)
      .optional(),
    /** No cart (the landing-page estimator): one unit boxed as this product type. */
    profile: z.enum(["pillow", "bolster", "accessory"]).optional(),
    destination: z.object({
      country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
      postal_code: z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9 -]+$/),
      city: z.string().trim().max(120).optional(),
      state: z.string().trim().max(120).optional(),
      line1: z.string().trim().max(200).optional(),
    }),
  })
  .refine((b) => (b.items?.length ?? 0) > 0 || b.profile, { message: "items or profile is required" });

/**
 * Shipping options for a cart (or one product type) to an address — the live
 * courier price for live methods, base_rate for flat ones; a live method with no
 * courier quote is left out. Public: the checkout
 * page, the product page and the landing-page estimator call it. What we pay the
 * courier is never in the response.
 */
export async function POST(req: Request) {
  if (isRateLimited({ bucket: "shipping-quote", key: clientIp(req), windowMs: 60_000, max: 40 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = QuoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { items, profile, destination } = parsed.data;
  const admin = supabaseAdmin();

  let methods: ShippingMethod[];
  try {
    // The shop delivers: Self-collect is a customisation option only.
    methods = ((await readShippingMethods(false, destination.country)) as ShippingMethod[]).filter(
      (m) => !isSelfCollect(m),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load shipping methods" },
      { status: 500 },
    );
  }

  let lines: ShippableLine[];
  if (items && items.length > 0) {
    try {
      lines = await loadShippableLines(admin, items);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not load products" },
        { status: 500 },
      );
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: "None of these items are available" }, { status: 400 });
    }
  } else {
    const settings = await readShippingSettings().catch(() => DEFAULT_SHIPPING_SETTINGS);
    lines = [
      {
        product_type: profile!,
        quantity: 1,
        weight_grams: null,
        unit_value: settings.estimate_declared_value,
        currency: methods[0]?.currency ?? "SGD",
        description: profile === "bolster" ? "Mbolster" : profile === "accessory" ? "Accessory" : "Mpillow",
      },
    ];
  }

  // Priced at subtotal 0, i.e. before free_above — see `price` above.
  const { options, rates } = await quoteShippingMethods(admin, {
    methods,
    lines,
    destination,
    subtotal: 0,
    loadSettings: () => readShippingSettings(),
  });

  const body: ShippingQuoteResponse = {
    ok: true,
    live: rates?.ok ?? false,
    options: options.map((o) => ({
      method_id: o.method.id,
      slug: o.method.slug,
      content: o.method.content,
      currency: o.currency,
      price: o.source === "easyship" ? o.amount : Number(o.method.base_rate),
      free_above: o.method.free_above === null ? null : Number(o.method.free_above),
      source: o.source,
      courier: o.courier ? { name: o.courier.name, umbrella_name: o.courier.umbrella_name } : null,
      min_days: o.min_days,
      max_days: o.max_days,
    })),
  };
  return NextResponse.json(body);
}
