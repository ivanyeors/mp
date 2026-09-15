import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAvailableComponents } from "@/lib/shop/customization-inventory";
import { PILLOW_SIZES, PILLOW_TIERS } from "@/lib/configurator/staff-assist";
import { loadTemplateKeys } from "@/lib/filling-templates/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff assist size×tier context (slice 04). Staff-gated: guests get 401.
 * Returns the product context the preview needs "as if the recommendation had
 * that size×tier", plus the product card's Default Filling Template placements
 * as the starting mix (template with no placements → empty mix).
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const size = searchParams.get("size")?.toUpperCase() ?? "";
  const tier = searchParams.get("tier")?.toLowerCase() ?? "";
  if (
    !(PILLOW_SIZES as readonly string[]).includes(size) ||
    !(PILLOW_TIERS as readonly string[]).includes(tier)
  ) {
    return NextResponse.json({ error: "Invalid size or tier" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: product, error: prodErr } = await admin
    .from("pillow_products")
    .select("id, size, kind, default_filling_template_id")
    .eq("size", size)
    .eq("kind", tier)
    .eq("is_active", true)
    .maybeSingle();
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });
  if (!product) {
    return NextResponse.json(
      { error: `No pillow product found for ${size} ${tier}` },
      { status: 404 },
    );
  }

  const [{ data: variant }, components, { data: buildableRows }] = await Promise.all([
    admin
      .from("product_variants")
      .select("id, product_id, price, currency")
      .eq("pillow_product_id", product.id)
      .eq("is_active", true)
      .maybeSingle(),
    getAvailableComponents(product.id),
    admin.from("product_buildable").select("product_id, size, buildable"),
  ]);
  const composed_buildable = Number(
    buildableRows?.find((r) => r.product_id === product.id)?.buildable ??
      buildableRows?.find((r) => r.size === size)?.buildable ??
      0,
  );

  let default_template: { id: number; name: string; placements: unknown[] } | null = null;
  if (product.default_filling_template_id) {
    const templateId = product.default_filling_template_id;
    // A stored default can outlive the membership that justified it (a template
    // rescoped or forked away from this size). Serving it anyway would propose
    // another size's recipe for this pillow, so check before reading it.
    const served = await loadTemplateKeys(admin, [Number(templateId)]);
    if (!served.ok) return NextResponse.json({ error: served.error }, { status: 500 });
    if ((served.byId.get(Number(templateId)) ?? []).includes(size)) {
      const [{ data: tpl }, { data: placements, error: pErr }] = await Promise.all([
        admin.from("bom_templates").select("id,name").eq("id", templateId).maybeSingle(),
        admin
          .from("filling_template_placements")
          .select("section,sub_section,slot,item_id,row_index,insert_order")
          .eq("template_id", templateId)
          .order("slot"),
      ]);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      if (tpl) default_template = { id: tpl.id, name: tpl.name, placements: placements ?? [] };
    }
  }

  return NextResponse.json({
    ok: true,
    pillow_product: { id: product.id, size: product.size, kind: product.kind },
    variant: variant
      ? {
          id: variant.id,
          product_id: variant.product_id,
          price: variant.price,
          currency: variant.currency,
        }
      : null,
    components,
    composed_buildable,
    default_template,
  });
}
