import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PILLOW_SIZES } from "@/lib/configurator/staff-assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff assist data (slice 04). Staff-gated: guests get 401, never template or
 * inventory data. Three query modes:
 *   ?size=M         → active size-scoped Filling Templates + active filling Items
 *   ?templateId=12  → that template's spatial placements
 *   (no params)     → active filling Items + color overrides only (bolster x-ray)
 */
export async function GET(req: NextRequest) {
  const staff = await getAdminContext();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const admin = supabaseAdmin();

  const templateIdParam = searchParams.get("templateId");
  if (templateIdParam) {
    const id = Number(templateIdParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid templateId" }, { status: 400 });
    }
    const { data: tpl, error: tErr } = await admin
      .from("bom_templates")
      .select("id,kind,role")
      .eq("id", id)
      .maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!tpl || tpl.role !== "filling" || tpl.kind !== "pillow") {
      return NextResponse.json({ error: "Filling Template not found" }, { status: 404 });
    }
    const { data: placements, error: pErr } = await admin
      .from("filling_template_placements")
      .select("section,sub_section,slot,item_id")
      .eq("template_id", id)
      .order("slot");
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, placements: placements ?? [] });
  }

  // No size param → items + color overrides only (the bolster x-ray has no
  // size-scoped pillow templates). A present-but-invalid size still 400s.
  const sizeParam = searchParams.get("size");
  const size = sizeParam?.toUpperCase() ?? null;
  if (size !== null && !(PILLOW_SIZES as readonly string[]).includes(size)) {
    return NextResponse.json({ error: "Invalid size" }, { status: 400 });
  }

  const [
    { data: templates, error: listErr },
    { data: items, error: itemsErr },
    { data: colorOverrides, error: colorsErr },
  ] = await Promise.all([
    size === null
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from("bom_templates")
          .select("id,name")
          .eq("kind", "pillow")
          .eq("key", size)
          .eq("role", "filling")
          .eq("is_active", true)
          .order("name"),
    admin
      .from("items")
      .select("id,name,subtype,size")
      .eq("category", "filling")
      .eq("is_active", true)
      .order("name"),
    // Slice 11: Product Builder color overrides for the x-ray CSS-variable pipeline.
    admin.from("filling_color_overrides").select("subtype,color"),
  ]);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (colorsErr) return NextResponse.json({ error: colorsErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    templates: templates ?? [],
    items: items ?? [],
    colorOverrides: colorOverrides ?? [],
  });
}
