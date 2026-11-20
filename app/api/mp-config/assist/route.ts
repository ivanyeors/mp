import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PILLOW_SIZES } from "@/lib/configurator/staff-assist";
import { isBolsterLength } from "@/lib/results/composed-sellable";
import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import {
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
} from "@/lib/spatial-fillings";
import { PLACEABLE_ITEMS_OR } from "@/lib/spatial-fillings/filling-groups";
import { loadDimensionOverrides } from "@/lib/spatial-fillings/dimension-overrides.server";
import { loadTemplateKeys, setTemplateKeys, templateIdsForKey } from "@/lib/filling-templates/membership";

type Scope = { kind: "pillow" | "bolster"; key: string };

function resolveScope(sizeParam: string, lengthParam: string): Scope | null {
  if (lengthParam) {
    return isBolsterLength(lengthParam) ? { kind: "bolster", key: lengthParam } : null;
  }
  return (PILLOW_SIZES as readonly string[]).includes(sizeParam)
    ? { kind: "pillow", key: sizeParam }
    : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

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
    const table = tpl.kind === "bolster" ? "bolster_template_placements" : "filling_template_placements";
    const cols =
      tpl.kind === "bolster" ? "slot,item_id" : "section,sub_section,slot,item_id,row_index,insert_order,offset_x_mm,offset_y_mm";
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
  const scope = resolveScope(size, lengthParam);
  if (!scope) {
    return NextResponse.json({ error: lengthParam ? "Invalid length" : "Invalid size" }, { status: 400 });
  }

  const members = await templateIdsForKey(admin, scope.key);
  if (!members.ok) return NextResponse.json({ error: members.error }, { status: 500 });
  const memberIds = members.ids;

  const [
    { data: templates, error: listErr },
    { data: items, error: itemsErr },
    { data: colorOverrides, error: colorsErr },
    dimensionOverrides,
  ] = await Promise.all([
    memberIds.length
      ? admin
          .from("bom_templates")
          .select("id,name")
          .eq("kind", scope.kind)
          .eq("role", "filling")
          .eq("is_active", true)
          .in("id", memberIds)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("items")
      .select("id,name,subtype,size,category,item_prices(msrp)")
      .or(scope.kind === "bolster" ? "category.eq.filling" : PLACEABLE_ITEMS_OR)
      .eq("is_active", true)
      .order("name"),
    admin.from("filling_color_overrides").select("subtype,color"),
    loadDimensionOverrides(admin),
  ]);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (colorsErr) return NextResponse.json({ error: colorsErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    templates: templates ?? [],
    items: (items ?? []).map(({ item_prices, ...item }) => ({
      ...item,
      msrp: (Array.isArray(item_prices) ? item_prices[0] : item_prices)?.msrp ?? null,
    })),
    colorOverrides: colorOverrides ?? [],
    dimensionOverrides,
  });
}

const PlacementRowSchema = z.object({
  section: z.string().default(""),
  sub_section: z.string().default(""),
  slot: z.number().int(),
  item_id: z.number().int().positive(),
  row_index: z
    .number()
    .int()
    .min(0)
    .max(MAX_LAYERS_PER_CELL - 1)
    .nullable()
    .optional(),
  insert_order: z.number().int().min(1).nullable().optional(),
  offset_x_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
  offset_y_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
});

const SaveSchema = z
  .object({
    mode: z.enum(["overwrite", "new"]),
    templateId: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    size: z.string().optional(),
    length: z.string().optional(),
    placements: z.array(PlacementRowSchema).min(1),
  })
  .refine((v) => (v.mode === "overwrite" ? v.templateId !== undefined : v.name !== undefined), {
    message: "mode=overwrite requires templateId; mode=new requires name",
  });

export async function POST(req: NextRequest) {
  const denied = await requireAdmin("inventory");
  if (denied) return denied;

  const json = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { mode, placements: rows } = parsed.data;

  const scope = resolveScope(
    parsed.data.size?.toUpperCase() ?? "",
    parsed.data.length?.toLowerCase() ?? "",
  );
  if (!scope) return NextResponse.json({ error: "Invalid size or length" }, { status: 400 });

  const admin = supabaseAdmin();
  const isBolster = scope.kind === "bolster";

  const cats = await lookupPlacementKinds(
    admin,
    rows.map((r) => r.item_id),
  );
  if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 });
  const valid = isBolster
    ? validateBolsterPlacements(rowsToBolsterPlacements(rows), cats.byId)
    : validatePillowPlacements(rowsToPillowPlacements(rows), cats.byId);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  let templateId: number;
  let name: string;

  if (mode === "overwrite") {
    const { data: tpl, error: tErr } = await admin
      .from("bom_templates")
      .select("id,name,kind,key,role")
      .eq("id", parsed.data.templateId!)
      .maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!tpl || tpl.role !== "filling") {
      return NextResponse.json({ error: "Filling Template not found" }, { status: 404 });
    }
    const tplKeys = await loadTemplateKeys(admin, [Number(tpl.id)]);
    if (!tplKeys.ok) return NextResponse.json({ error: tplKeys.error }, { status: 500 });
    const served = tplKeys.byId.get(Number(tpl.id)) ?? [tpl.key];
    if (tpl.kind !== scope.kind || !served.includes(scope.key)) {
      return NextResponse.json(
        {
          error: `That template applies to ${tpl.kind} ${served.join(", ")}, not ${scope.kind} ${scope.key}`,
        },
        { status: 400 },
      );
    }
    templateId = tpl.id;
    name = tpl.name;
  } else {
    name = parsed.data.name!;
    const { data: created, error: insErr } = await admin
      .from("bom_templates")
      .insert({
        kind: scope.kind,
        key: scope.key,
        pillow_kind: null,
        pillow_variant: null,
        name,
        role: "filling",
        is_active: true,
      })
      .select("id,name")
      .single();
    if (insErr?.code === "23505") {
      return NextResponse.json(
        { error: `A Filling Template named “${name}” already exists for ${scope.key}` },
        { status: 409 },
      );
    }
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    const membership = await setTemplateKeys(admin, {
      templateId: created.id,
      kind: scope.kind,
      keys: [scope.key],
    });
    if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 });
    templateId = created.id;
    name = created.name;
  }

  const table = isBolster ? "bolster_template_placements" : "filling_template_placements";
  const payload = rows.map((r) =>
    isBolster
      ? { template_id: templateId, slot: r.slot, item_id: r.item_id }
      : {
          template_id: templateId,
          section: r.section,
          sub_section: r.sub_section,
          slot: r.slot,
          item_id: r.item_id,
          row_index: r.row_index ?? null,
          insert_order: r.insert_order ?? null,
          offset_x_mm: r.offset_x_mm ?? null,
          offset_y_mm: r.offset_y_mm ?? null,
        },
  );
  const { error: delErr } = await admin.from(table).delete().eq("template_id", templateId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  const { error: insErr } = await admin.from(table).insert(payload);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, templateId, name });
}
