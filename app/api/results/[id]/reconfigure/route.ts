import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import { preferenceCategoryAllowed } from "@/lib/configurator/preference-policy";
import { loadAssignedBuild } from "@/lib/results/assigned-build";
import { decideFillingAssign } from "@/lib/results/filling-assign";
import {
  AddonLineSchema,
  AddressSchema,
  PreferenceLineSchema,
} from "@/lib/results/finish-schemas";
import { staffEditableResult } from "@/lib/results/staff-edit";
import {
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";
import {
  fingerprintPlacements,
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  rowsToPillowPlacements,
  validatePillowPlacements,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

const ReconfigureSchema = z.object({
  assignedSize: z.enum(PILLOW_SIZES),
  assignedTier: z.enum(["basic", "premium"]),
  /** The questionnaire answers, so a re-measure travels with the rebuild. */
  measurements: z.record(z.string(), z.unknown()).optional(),
  preferenceLines: z.array(PreferenceLineSchema).min(1),
  addonLines: z.array(AddonLineSchema).default([]),
  /** Both or neither — a method without an address cannot be rated or taxed. */
  shippingMethodId: z.string().uuid().optional(),
  shippingAddress: AddressSchema.optional(),
  /** Spatial Result snapshot. Empty means "leave the stored mix alone". */
  placements: z
    .array(
      z.object({
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
      }),
    )
    .default([]),
  /** Client's still-matching template claim — re-verified here, never trusted alone. */
  fillingTemplateId: z.number().int().positive().nullable().optional(),
});

/**
 * Staff re-configuration of a live Result (see `lib/results/staff-edit.ts`).
 *
 * Takes what the configurator composed — size×tier, cover/case, add-ons,
 * shipping and the filling mix — writes it onto the Result, then reprices
 * through `loadAssignedBuild`, which is the same function Accept charges from.
 * That ordering is the point: `final_amount` is never left describing the build
 * this request replaced.
 *
 * The Authorization hold is deliberately NOT touched. A card is authorised
 * once, for one amount, and Stripe will not raise it; `planCapture` already
 * settles the difference either way — a partial capture when the rebuild came
 * out cheaper, a Balance payment top-up when it came out dearer (ADR 0016).
 *
 * Status is preserved. A `held` Result stays in the assign queue; an `assigned`
 * one stays assigned, so the customer's existing status link and its Pay button
 * keep working and simply quote the new number.
 *
 * `is_pre_order` is left alone on purpose. It is sticky for the submission by
 * ADR 0005 — restock must not clear it — and the stock check below already
 * refuses a rebuild onto an out-of-stock preference, so the flag can only ever
 * be stale in the honest direction.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReconfigureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  if (Boolean(input.shippingMethodId) !== Boolean(input.shippingAddress)) {
    return NextResponse.json(
      { error: "Shipping method and address go together" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, product_type, order_id, filling_template_id, shipping_method, shipping_address, currency, measured_by_type",
    )
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const editable = staffEditableResult(row);
  if (!editable.ok) return NextResponse.json({ error: editable.reason }, { status: 409 });

  for (const line of input.preferenceLines) {
    if (!preferenceCategoryAllowed("pillow", line.category)) {
      return NextResponse.json({ error: `Invalid preference ${line.category}` }, { status: 400 });
    }
  }

  const itemIds = [
    ...new Set([
      ...input.preferenceLines.map((l) => l.item_id),
      ...input.addonLines.map((l) => l.item_id),
    ]),
  ];
  const [{ data: items }, { data: shippingRow }] = await Promise.all([
    itemIds.length
      ? admin.from("items").select("id, category").in("id", itemIds)
      : Promise.resolve({ data: [] as Array<{ id: number; category: string }> }),
    input.shippingMethodId
      ? admin
          .from("shipping_methods")
          .select("slug")
          .eq("id", input.shippingMethodId)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (input.shippingMethodId && !shippingRow) {
    return NextResponse.json({ error: "Invalid shipping method" }, { status: 400 });
  }

  // Same category rules as the hold submit and the customer's finish.
  const categoryById = new Map((items ?? []).map((i) => [i.id as number, String(i.category)]));
  for (const line of input.preferenceLines) {
    const cat = categoryById.get(line.item_id);
    if (!cat || !itemMatchesPreferenceRole(cat, line.category)) {
      return NextResponse.json({ error: `Invalid preference item ${line.item_id}` }, { status: 400 });
    }
  }
  for (const line of input.addonLines) {
    const cat = categoryById.get(line.item_id);
    if (!cat || cat === "filling" || isProtectorInventoryCategory(cat) || isCaseInventoryCategory(cat)) {
      return NextResponse.json({ error: `Invalid add-on item ${line.item_id}` }, { status: 400 });
    }
  }

  // Filling mix. An empty array means the editor sent nothing to change, so the
  // stored snapshot (and its template link) survives untouched — a cover swap
  // must never silently empty a build the workshop is already packing.
  const placementRows = input.placements as PillowPlacementRow[];
  let persistedTemplateId: number | null = row.filling_template_id as number | null;
  let fingerprint: string | null | undefined;
  if (placementRows.length > 0) {
    const cats = await lookupPlacementKinds(admin, placementRows.map((r) => r.item_id));
    if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 });
    const valid = validatePillowPlacements(
      rowsToPillowPlacements(placementRows),
      cats.byId,
      { tier: input.assignedTier },
    );
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

    // Divergence rule (ADR 0008): the template link survives only while the mix
    // still exactly matches that template's current placements.
    const claimed = input.fillingTemplateId ?? null;
    const saved = rowsToPillowPlacements(placementRows);
    if (claimed == null) {
      // Composed by hand in the editor: an Unpromoted configuration until
      // someone promotes it into a catalog template from the Admin Panel.
      persistedTemplateId = null;
      fingerprint = fingerprintPlacements(saved);
    } else {
      const { data: tplPl, error: tplErr } = await admin
        .from("filling_template_placements")
        .select("section, sub_section, slot, item_id")
        .eq("template_id", claimed);
      if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
      const decision = decideFillingAssign({
        confirmedTemplateId: claimed,
        saved,
        templatePlacements: rowsToPillowPlacements((tplPl ?? []) as PillowPlacementRow[]),
      });
      persistedTemplateId = decision.fillingTemplateId;
      fingerprint = decision.fillingFingerprint;
    }
  }

  // Staff may leave shipping alone (an Assisted customisation has none yet, and
  // the customer's own finish is where it lands); only a method actually sent
  // rewrites the stored pair.
  const shippingPatch = shippingRow
    ? {
        shipping_method: shippingRow.slug as string,
        shipping_address: input.shippingAddress! as Record<string, unknown>,
      }
    : null;

  const rewritten = {
    assigned_size: input.assignedSize,
    assigned_tier: input.assignedTier,
    preference_lines: input.preferenceLines.map((l) => ({
      item_id: l.item_id,
      quantity: l.quantity,
      category: l.category,
    })),
    addon_lines: input.addonLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
    filling_template_id: persistedTemplateId,
    ...(shippingPatch ?? {}),
    ...(input.measurements ? { data: input.measurements } : {}),
    ...(fingerprint !== undefined ? { filling_fingerprint: fingerprint } : {}),
  };

  // Price the build as it will be stored, BEFORE writing it, so a build Costings
  // cannot price is refused with the Result untouched rather than half-saved.
  const build = await loadAssignedBuild(
    admin,
    {
      id: row.id as string,
      product_type: "pillow",
      assigned_length: null,
      currency: row.currency as string | null,
      measured_by_type: row.measured_by_type as string | null,
      ...rewritten,
      shipping_method: shippingPatch?.shipping_method ?? (row.shipping_method as string | null),
      shipping_address: shippingPatch?.shipping_address ?? row.shipping_address,
    },
    // The snapshot rows are written further down; quote the new mix rather than
    // the one still on disk. Empty means the stored snapshot is unchanged, and
    // the DB read is exactly right.
    placementRows.length > 0 ? { fillingPlacements: placementRows } : undefined,
  );
  if (!build.ok) return NextResponse.json({ error: build.error }, { status: 400 });
  if (build.shortages.length > 0) {
    const detail = build.shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Not enough stock for this build: ${detail}`, shortages: build.shortages },
      { status: 409 },
    );
  }

  // A concurrent Accept moves the row out of an editable state; the guard makes
  // this request lose that race instead of repricing a Result mid-payment.
  const { data: updated, error: updateErr } = await admin
    .from("mp_config_responses")
    .update({ ...rewritten, final_amount: build.pricing.total })
    .eq("id", id)
    .eq("status", row.status)
    .is("order_id", null)
    .select("id");
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json(
      { error: "This Result moved on while it was being re-configured" },
      { status: 409 },
    );
  }

  if (placementRows.length > 0) {
    const { error: delErr } = await admin
      .from("result_filling_placements")
      .delete()
      .eq("result_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await admin.from("result_filling_placements").insert(
      placementRows.map((r) => ({
        result_id: id,
        section: r.section,
        sub_section: r.sub_section,
        slot: r.slot,
        item_id: r.item_id,
        row_index: r.row_index ?? null,
        insert_order: r.insert_order ?? null,
        offset_x_mm: r.offset_x_mm ?? null,
        offset_y_mm: r.offset_y_mm ?? null,
      })),
    );
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    resultId: id,
    status: row.status,
    assignedSize: input.assignedSize,
    assignedTier: input.assignedTier,
    fillingTemplateId: persistedTemplateId,
    finalAmount: build.pricing.total,
    currency: row.currency ?? "SGD",
  });
}
