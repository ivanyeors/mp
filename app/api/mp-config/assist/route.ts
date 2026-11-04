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

/**
 * A Filling Template is scoped by product kind + size/length key, and staff
 * reach this endpoint with whichever one their surface models. Shared by GET
 * and POST so a saved mix can never land under a scope the reader would not
 * offer back.
 */
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

/**
 * Staff assist data (slices 04/13). Staff-gated: guests get 401, never template
 * or inventory data. Query modes:
 *   ?size=M         → active size-scoped pillow Filling Templates + filling Items
 *   ?length=short   → active length-scoped bolster Filling Templates + filling Items
 *   ?templateId=12  → that template's spatial placements (pillow or bolster rows)
 */
export async function GET(req: NextRequest) {
  // Same permission the page gate uses, so a role that cannot enter assist mode
  // cannot reach its data by calling the endpoint directly either.
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
    // Bolster templates use their own schema: slot rows only, never pillow enums.
    const table = tpl.kind === "bolster" ? "bolster_template_placements" : "filling_template_placements";
    // row_index is the x-ray stack depth: a render-path read must carry it, or a
    // stacked template flattens to side-by-side here while the shopper preview
    // (shop/customize, mp-basic/recommend) renders it stacked. See
    // spatial-fillings/api-contract.check.ts for the render-path reader list.
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

  // Membership, not `key`: assist offers every recipe that serves this size.
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
      .select("id,name,subtype,size,category")
      // Neck supports are pillow-only (premium; the panel hides them on basic).
      .or(scope.kind === "bolster" ? "category.eq.filling" : PLACEABLE_ITEMS_OR)
      .eq("is_active", true)
      .order("name"),
    // Slice 11: Product Builder color overrides for the x-ray CSS-variable pipeline.
    admin.from("filling_color_overrides").select("subtype,color"),
    // Slice 02/12: Settings dimension overrides for the true-scale x-ray.
    loadDimensionOverrides(admin),
  ]);
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (colorsErr) return NextResponse.json({ error: colorsErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    templates: templates ?? [],
    items: items ?? [],
    colorOverrides: colorOverrides ?? [],
    dimensionOverrides,
  });
}

// Shape gate only; the spatial-fillings lib does the semantic validation per
// kind. Mirrors the Admin Panel's PUT schema — row_index is the piece's LAYER
// (0 = top/front) and its bound derives from MAX_LAYERS_PER_CELL so it cannot
// drift from validatePillowPlacements or the DB's `row_index between 0 and 4`.
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
    /** Required for mode=overwrite: the catalog template to replace in place. */
    templateId: z.number().int().positive().optional(),
    /** Required for mode=new: the catalog name, unique within (kind, key). */
    name: z.string().trim().min(1).max(120).optional(),
    size: z.string().optional(),
    length: z.string().optional(),
    // An empty mix is never a save — it would publish (or blank) an empty template.
    placements: z.array(PlacementRowSchema).min(1),
  })
  .refine((v) => (v.mode === "overwrite" ? v.templateId !== undefined : v.name !== undefined), {
    message: "mode=overwrite requires templateId; mode=new requires name",
  });

/**
 * Save the staff-edited session mix back to the Filling Template catalog
 * (pillow or bolster), either replacing the loaded template's placements or
 * creating a new size/length-scoped one.
 *
 * Gated on `inventory` rather than the GET's plain staff check: reading
 * templates into one session is not the same act as writing the catalog every
 * future session loads from.
 */
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

  // Same gate the Admin Panel applies: fillings only, and within the per-cell
  // layer/piece caps. A mix the x-ray let staff build can still be invalid here
  // if an item was retired mid-session.
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
    // Without this a Size M mix could be written onto a Size L template, which
    // the size-scoped reader would then hand to the wrong product card. A shared
    // template passes when this size is one it serves — and overwriting it
    // changes the recipe for every other size too, which is why assist only
    // reaches templates the operator already picked from this size's list.
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
        // Filling Templates carry no tier and no variant — only sizes (ADR 0003).
        pillow_kind: null,
        pillow_variant: null,
        name,
        role: "filling",
        is_active: true,
      })
      .select("id,name")
      .single();
    // unique (kind, key, name) — surface the clash instead of a raw 500.
    if (insErr?.code === "23505") {
      return NextResponse.json(
        { error: `A Filling Template named “${name}” already exists for ${scope.key}` },
        { status: 409 },
      );
    }
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    // A template born here serves the size it was authored at; an operator
    // widens it from Configure, never from assist.
    const membership = await setTemplateKeys(admin, {
      templateId: created.id,
      kind: scope.kind,
      keys: [scope.key],
    });
    if (!membership.ok) return NextResponse.json({ error: membership.error }, { status: 400 });
    templateId = created.id;
    name = created.name;
  }

  // Placements are the "where" truth; legacy bom_template_lines stay untouched
  // as the pack-list fallback for templates without placements (ADR 0008).
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
