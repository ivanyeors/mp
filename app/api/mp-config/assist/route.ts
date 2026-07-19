import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PILLOW_SIZES } from "@/lib/configurator/staff-assist";
import { isBolsterLength } from "@/lib/results/composed-sellable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff assist data (slices 04/13). Staff-gated: guests get 401, never template
 * or inventory data. Query modes:
 *   ?size=M         → active size-scoped pillow Filling Templates + filling Items
 *   ?length=short   → active length-scoped bolster Filling Templates + filling Items
 *   ?templateId=12  → that template's spatial placements (pillow or bolster rows)
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
    if (!tpl || tpl.role !== "filling" || (tpl.kind !== "pillow" && tpl.kind !== "bolster")) {
      return NextResponse.json({ error: "Filling Template not found" }, { status: 404 });
    }
    // Bolster templates use their own schema: slot rows only, never pillow enums.
    const table = tpl.kind === "bolster" ? "bolster_template_placements" : "filling_template_placements";
    const cols = tpl.kind === "bolster" ? "slot,item_id" : "section,sub_section,slot,item_id";
    const { data: placements, error: pErr } = await admin
      .from(table)
      .select(cols)
      .eq("template_id", id)
      .order("slot");
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, placements: placements ?? [] });
  }

  const lengthParam = searchParams.get("length")?.toLowerCase() ?? "";
  const size = searchParams.get("size")?.toUpperCase() ?? "";
  if (lengthParam ? !isBolsterLength(lengthParam) : !(PILLOW_SIZES as readonly string[]).includes(size)) {
    return NextResponse.json({ error: lengthParam ? "Invalid length" : "Invalid size" }, { status: 400 });
  }
  const scope = lengthParam
    ? { kind: "bolster", key: lengthParam }
    : { kind: "pillow", key: size };

  const [
    { data: templates, error: listErr },
    { data: items, error: itemsErr },
    { data: colorOverrides, error: colorsErr },
  ] = await Promise.all([
    admin
      .from("bom_templates")
      .select("id,name")
      .eq("kind", scope.kind)
      .eq("key", scope.key)
      .eq("role", "filling")
      .eq("is_active", true)
      .order("name"),
    admin
      .from("items")
      .select("id,name,subtype")
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
