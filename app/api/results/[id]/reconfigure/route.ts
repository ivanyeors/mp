import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { lookupPlacementKinds } from "@/lib/bom-sanitizer";
import { preferenceCategoryAllowed } from "@/lib/configurator/preference-policy";
import { loadAssignedBuild } from "@/lib/results/assigned-build";
import { decideFillingAssign } from "@/lib/results/filling-assign";
import { AddonLineSchema, PreferenceLineSchema } from "@/lib/results/finish-schemas";
import { ShippingAddressInputSchema, resolveShippingAddress } from "@/lib/shipping/self-collect";
import { staffEditableResult } from "@/lib/results/staff-edit";
import { quoteResultShipping, resultParcelTypes, sameQuoteDestination } from "@/lib/results/shipping";
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
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

const ReconfigureSchema = z.object({
  assignedSize: z.enum(PILLOW_SIZES),
  assignedTier: z.enum(["basic", "premium"]),
  measurements: z.record(z.string(), z.unknown()).optional(),
  preferenceLines: z.array(PreferenceLineSchema).min(1),
  addonLines: z.array(AddonLineSchema).default([]),
  shippingMethodId: z.string().uuid().optional(),
  shippingAddress: ShippingAddressInputSchema.optional(),
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
  fillingTemplateId: z.number().int().positive().nullable().optional(),
});

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
      "id, status, product_type, order_id, filling_template_id, shipping_method, shipping_address, shipping_rate, currency, measured_by_type, coupon_terms, paired_build_id",
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
          .select("*")
          .eq("id", input.shippingMethodId)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (input.shippingMethodId && !shippingRow) {
    return NextResponse.json({ error: "Invalid shipping method" }, { status: 400 });
  }
  const shippingAddress = shippingRow
    ? await resolveShippingAddress(admin, shippingRow, input.shippingAddress!)
    : null;
  if (shippingAddress && !shippingAddress.ok) {
    return NextResponse.json({ error: shippingAddress.error }, { status: shippingAddress.status });
  }

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

    const claimed = input.fillingTemplateId ?? null;
    const saved = rowsToPillowPlacements(placementRows);
    if (claimed == null) {
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

  let shippingPatch: {
    shipping_method: string;
    shipping_address: Record<string, unknown>;
    shipping_rate: number | string | null;
  } | null = null;
  if (shippingRow && shippingAddress?.ok) {
    const unchanged =
      shippingRow.slug === row.shipping_method &&
      row.shipping_rate != null &&
      sameQuoteDestination(row.shipping_address, shippingAddress.address);
    let rate: number | string | null = row.shipping_rate as number | string | null;
    if (!unchanged) {
      const quoted = await quoteResultShipping(admin, {
        method: shippingRow as ShippingMethod,
        parcelTypes: resultParcelTypes({ ...row, id: row.id as string, product_type: "pillow" }),
        destination: shippingAddress.address,
      });
      if (!quoted.ok) return NextResponse.json({ error: quoted.error }, { status: 400 });
      rate = quoted.rate;
    }
    shippingPatch = {
      shipping_method: shippingRow.slug as string,
      shipping_address: shippingAddress.address as Record<string, unknown>,
      shipping_rate: rate,
    };
  }

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

  const build = await loadAssignedBuild(
    admin,
    {
      id: row.id as string,
      product_type: "pillow",
      assigned_length: null,
      currency: row.currency as string | null,
      measured_by_type: row.measured_by_type as string | null,
      coupon_terms: row.coupon_terms,
      ...rewritten,
      shipping_method: shippingPatch?.shipping_method ?? (row.shipping_method as string | null),
      shipping_address: shippingPatch?.shipping_address ?? row.shipping_address,
      shipping_rate: shippingPatch ? shippingPatch.shipping_rate : (row.shipping_rate as number | string | null),
    },
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
