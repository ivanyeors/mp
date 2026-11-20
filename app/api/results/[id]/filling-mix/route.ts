import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import { loadResultFillingMix } from "@/lib/results/admin/filling-mix";
import { draftMixVerdict } from "@/lib/results/filling-mix";
import { buildFillingSnapshot } from "@/lib/results/filling-snapshot";
import {
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  rowsToPillowPlacements,
  validatePillowPlacements,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().uuid() });

const BodySchema = z.object({
  tier: z.enum(["basic", "premium"]),
  fillingTemplateId: z.number().int().positive().nullable().optional(),
  placements: z.array(
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
  ),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("results");
  if (denied) return denied;
  const parsed = ParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("mp_config_responses")
    .select("id, product_type")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const loaded = await loadResultFillingMix(admin, row.id, row.product_type === "bolster" ? "bolster" : "pillow");
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 });
  return NextResponse.json({ ok: true, ...loaded.mix });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("results");
  if (denied) return denied;
  const parsedParams = ParamsSchema.safeParse(await ctx.params);
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const id = parsedParams.data.id;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const admin = supabaseAdmin();
  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select("id, status, order_id, product_type, filling_fingerprint, filling_template_id")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const verdict = draftMixVerdict(row);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 409 });

  const placements = rowsToPillowPlacements(input.placements as PillowPlacementRow[]);
  if (placements.length) {
    const kinds = await lookupPlacementKinds(admin, [...new Set(placements.map((p) => p.itemId))]);
    if (!kinds.ok) return NextResponse.json({ error: kinds.error }, { status: 400 });
    const valid = validatePillowPlacements(placements, kinds.byId, { tier: input.tier });
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  let templatePlacements: PillowPlacement[] | null = null;
  const claimedTemplateId = input.fillingTemplateId ?? null;
  if (claimedTemplateId != null) {
    const { data: tplRows, error: tplErr } = await admin
      .from("filling_template_placements")
      .select("section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm")
      .eq("template_id", claimedTemplateId);
    if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
    templatePlacements = rowsToPillowPlacements((tplRows ?? []) as PillowPlacementRow[]);
  }
  const snapshot = buildFillingSnapshot({ placements, claimedTemplateId, templatePlacements });

  const { data: updated, error: updErr } = await admin
    .from("mp_config_responses")
    .update({ filling_fingerprint: snapshot.fingerprint, filling_template_id: snapshot.fillingTemplateId })
    .eq("id", id)
    .is("status", null)
    .is("order_id", null)
    .select("id");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json(
      { error: "The customer submitted while you were editing — reload to confirm the mix with Save assignment" },
      { status: 409 },
    );
  }

  const { error: delErr } = await admin.from("result_filling_placements").delete().eq("result_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (snapshot.rows.length) {
    const { error: insErr } = await admin
      .from("result_filling_placements")
      .insert(snapshot.rows.map((r) => ({ result_id: id, ...r })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "result.filling_mix.save",
    entityType: "mp_config_response",
    entityId: id,
    before: { filling_fingerprint: row.filling_fingerprint ?? null, filling_template_id: row.filling_template_id ?? null },
    after: {
      filling_fingerprint: snapshot.fingerprint,
      filling_template_id: snapshot.fillingTemplateId,
      pieces: snapshot.rows.length,
      tier: input.tier,
    },
  });

  return NextResponse.json({
    ok: true,
    fillingFingerprint: snapshot.fingerprint,
    fillingTemplateId: snapshot.fillingTemplateId,
    pieces: snapshot.rows.length,
  });
}
