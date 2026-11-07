import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import { placementRows } from "@/lib/customer-pillow/bought";
import { reloadCustomerPillow } from "@/lib/customer-pillow/reload";
import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import {
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  MAX_PIECES_PER_CELL,
  SECTIONS,
  SUB_SECTIONS,
  fingerprintPlacements,
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  validatePillowPlacements,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import { PLACEABLE_ITEMS_OR } from "@/lib/spatial-fillings/filling-groups";
import { actingProfile } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape gate, as the Result's filling-mix route; `validatePillowPlacements` does the rest. */
const ReadjustSchema = z.object({
  size: z.enum(PILLOW_TEMPLATE_KEYS),
  /** The template the pillow was re-adjusted from: read by Staff, never trusted to describe the mix. */
  fillingTemplateId: z.number().int().positive().nullable(),
  placements: z
    .array(
      z.object({
        section: z.string(),
        sub_section: z.string(),
        slot: z.number().int(),
        item_id: z.number().int().positive(),
        row_index: z.number().int().min(0).max(MAX_LAYERS_PER_CELL - 1).nullable().optional(),
        insert_order: z.number().int().min(1).nullable().optional(),
        offset_x_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
        offset_y_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
      }),
    )
    .max(SECTIONS.length * SUB_SECTIONS.length * MAX_PIECES_PER_CELL),
});

async function customerExists(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("customers").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/shop/customers/[id]/pillow/readjust — the Items the Re-adjust
 * editor may place: every active filling, and the neck supports and ear pads,
 * as Result detail offers them. Read when Staff open Re-adjust, so the
 * Customer page does not carry the catalog on every view.
 */
export async function GET() {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const { data, error } = await supabaseAdmin()
    .from("items")
    .select("id, name, subtype, size, category")
    .or(PLACEABLE_ITEMS_OR)
    .eq("is_active", true)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    items: (data ?? []).map((i) => ({
      id: Number(i.id),
      name: String(i.name),
      subtype: (i.subtype as string | null) ?? null,
      size: (i.size as string | null) ?? null,
      category: String(i.category),
    })),
  });
}

/**
 * POST /api/shop/customers/[id]/pillow/readjust — a Re-adjustment (ADR 0042 l):
 * the fillings Staff left in the Customer's pillow at a visit. Saved on the
 * Staff link (`customer_pillows`) as the mix itself, with the size and the
 * template it was re-adjusted from, so the Customer page and their Profile
 * draw the pillow as it now is.
 *
 * It writes that row and nothing else. A Re-adjustment is a Service: it moves
 * no stock, sets no price and reaches no Result, order or analytics; the
 * Service fee is charged when it is booked. The mix is checked as a Result's
 * is (cells, Layers, pieces, Items), with no Tier: the pillow on record does
 * not carry one. Every save is in the audit log with the mix before and after.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id) || !(await customerExists(id))) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const parsed = ReadjustSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send the size and the fillings in the pillow." }, { status: 400 });
  const { size } = parsed.data;

  const placements = rowsToPillowPlacements(parsed.data.placements as PillowPlacementRow[]);
  if (placements.length === 0) {
    return NextResponse.json({ error: "Leave at least one filling in the pillow." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const kinds = await lookupPlacementKinds(admin, [...new Set(placements.map((p) => p.itemId))]);
  if (!kinds.ok) return NextResponse.json({ error: kinds.error }, { status: 400 });
  const valid = validatePillowPlacements(placements, kinds.byId);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  // Where it came from is kept only while it names a pillow Filling Template,
  // active or not: an order's template may have been retired since, or deleted.
  let fillingTemplateId: number | null = null;
  if (parsed.data.fillingTemplateId !== null) {
    const { data: tpl, error } = await admin
      .from("bom_templates")
      .select("id, role, kind")
      .eq("id", parsed.data.fillingTemplateId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (tpl && tpl.role === "filling" && tpl.kind === "pillow") fillingTemplateId = Number(tpl.id);
  }

  const { data: before, error: beforeErr } = await admin
    .from("customer_pillows")
    .select("pillow_size, filling_template_id, filling_placements")
    .eq("customer_id", id)
    .maybeSingle();
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });

  const rows = pillowPlacementsToRows(placements);
  const { error } = await admin.from("customer_pillows").upsert(
    {
      customer_id: id,
      pillow_size: size,
      filling_template_id: fillingTemplateId,
      filling_placements: rows,
      linked_by_user_id: ctx.userId,
      linked_by_profile_id: (await actingProfile(ctx.memberId))?.id ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAdminAction({
    actor: ctx,
    action: "customer_pillow.readjust",
    entityType: "customer",
    entityId: id,
    before: before
      ? {
          pillow_size: before.pillow_size,
          filling_template_id: before.filling_template_id,
          filling_placements: before.filling_placements === null ? null : placementRows(before.filling_placements),
        }
      : null,
    after: {
      pillow_size: size,
      filling_template_id: fillingTemplateId,
      pieces: rows.length,
      filling_fingerprint: fingerprintPlacements(placements),
      filling_placements: rows,
    },
  });

  const loaded = await reloadCustomerPillow(id);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 });
  return NextResponse.json({ ok: true, pillow: loaded.pillow });
}
