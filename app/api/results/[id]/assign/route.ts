import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { lookupItemCategories } from "@/lib/bom-sanitizer";
import { assembleBuild, findStockShortages, preferenceRoleOf } from "@/lib/build-assembly";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { transitionResult } from "@/lib/result-lifecycle";
import { decideFillingAssign } from "@/lib/results/filling-assign";
import {
  derivePackList,
  MAX_LAYERS_PER_CELL,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
  type AnyPlacement,
  type BolsterPlacementRow,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import { priceResult } from "@/lib/result-pricing";
import { priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import {
  renderResultAssignedEmail,
  type ResultPricing,
} from "@/lib/email/results";
import {
  BOLSTER_LENGTHS,
  isBolsterLength,
  loadComposedSellable,
} from "@/lib/results/composed-sellable";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

const AssignSchema = z.object({
  assignedSize: z.enum(PILLOW_SIZES).optional(),
  assignedTier: z.enum(["basic", "premium"]).optional(),
  assignedLength: z.enum(BOLSTER_LENGTHS).optional(),
  fillingTemplateId: z.number().int().positive(),
  /** Spatial Result snapshot (pillow cells or bolster slots). Shape gate — lib validates per kind. */
  placements: z
    .array(
      z.object({
        section: z.string().default(""),
        sub_section: z.string().default(""),
        slot: z.number().int(),
        item_id: z.number().int().positive(),
        // row_index is the piece's LAYER (0 = top/front). Bound derives from
        // MAX_LAYERS_PER_CELL, matching the DB constraint and
        // validatePillowPlacements — NOT from the per-cell piece cap, which is
        // five times larger now that a layer holds several pieces.
        row_index: z.number().int().min(0).max(MAX_LAYERS_PER_CELL - 1).nullable().optional(),
      }),
    )
    .optional(),
});

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

/** Best-effort "final build ready" notice. Rendering lives in lib/email/results.ts. */
async function sendAssignedEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string;
  origin: string;
  size: string | null;
  tier: string | null;
  length: string | null;
  productType: string;
  fillingSummary: string[];
  preferences: string[];
  addons: string[];
  pricing: ResultPricing | null;
  needsFinish: boolean;
}) {
  try {
    await getEmailTransport().send({
      to: opts.to,
      from: getDefaultFromAddress(),
      ...renderResultAssignedEmail(opts),
    });
    return "sent" as const;
  } catch (e) {
    console.error("Result assigned email failed", e);
    return "failed" as const;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Assign sets the sold configuration and the final amount that will be captured.
  // It is staff-only; the route had no gate at all, and proxy.ts skips /api.
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, product_type, suggested_size, suggested_tier, suggested_length, preference_lines, addon_lines, shipping_method, shipping_address, authorized_amount, currency, payment_intent_id, filling_template_id, customer_email, access_token",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const productType = (row.product_type as "pillow" | "bolster" | null) ?? "pillow";
  const assignedSize =
    productType === "pillow"
      ? (input.assignedSize ?? (row.suggested_size as (typeof PILLOW_SIZES)[number] | null))
      : null;
  const assignedTier =
    productType === "pillow"
      ? (input.assignedTier ?? (row.suggested_tier as "basic" | "premium" | null))
      : null;
  const assignedLengthRaw =
    productType === "bolster"
      ? (input.assignedLength ?? (row.suggested_length as string | null))
      : null;
  const assignedLength =
    assignedLengthRaw && isBolsterLength(assignedLengthRaw) ? assignedLengthRaw : null;

  if (productType === "pillow") {
    if (!assignedSize || !assignedTier) {
      return NextResponse.json(
        { error: "Pillow assignment requires size and tier" },
        { status: 400 },
      );
    }
  } else if (!assignedLength) {
    return NextResponse.json(
      { error: "Bolster assignment requires length (short, medium, or long)" },
      { status: 400 },
    );
  }

  const sizeKey = productType === "pillow" ? assignedSize! : assignedLength!;

  const { data: template, error: tplErr } = await admin
    .from("bom_templates")
    .select("id, kind, key, role, is_active, name")
    .eq("id", input.fillingTemplateId)
    .maybeSingle();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!template) {
    return NextResponse.json({ error: "Filling Template not found" }, { status: 400 });
  }

  const selectable = filterSelectableFillingTemplates([template], {
    productType,
    size: sizeKey,
  });
  if (selectable.length === 0) {
    return NextResponse.json(
      {
        error: `Filling Template must be an active filling template for ${productType} size ${sizeKey}`,
      },
      { status: 400 },
    );
  }

  if (row.status !== "held") {
    return NextResponse.json(
      { error: `Cannot assign from status ${row.status ?? "unset"}` },
      { status: 400 },
    );
  }

  // Spatial snapshot rows: validate per product kind via the lib. Bolster rows
  // carry only slot/item_id and never validate against the pillow enums.
  const isBolster = productType === "bolster";
  const toPlacements = (
    rows: Array<{ section?: string; sub_section?: string; slot: number; item_id: number }>,
  ): AnyPlacement[] =>
    isBolster
      ? rowsToBolsterPlacements(rows.map((r) => ({ slot: r.slot, item_id: r.item_id })))
      : rowsToPillowPlacements(rows as PillowPlacementRow[]);

  let placementRows: Array<{ section: string; sub_section: string; slot: number; item_id: number; row_index?: number | null }> | null =
    input.placements ?? null;
  let tplPlacementRows: Array<PillowPlacementRow | BolsterPlacementRow> = [];
  if (placementRows) {
    const { data: tplPl, error: tplPlErr } = await admin
      .from(isBolster ? "bolster_template_placements" : "filling_template_placements")
      .select(isBolster ? "slot, item_id" : "section, sub_section, slot, item_id")
      .eq("template_id", input.fillingTemplateId);
    if (tplPlErr) return NextResponse.json({ error: tplPlErr.message }, { status: 500 });
    tplPlacementRows = (tplPl ?? []) as unknown as Array<PillowPlacementRow | BolsterPlacementRow>;

    if (placementRows.length === 0) {
      if (tplPlacementRows.length > 0) {
        return NextResponse.json(
          { error: "Place at least one filling piece (or reload the template)" },
          { status: 400 },
        );
      }
      // Legacy flat template with an untouched empty grid: assign it as-is (flat path).
      placementRows = null;
    } else {
      const cats = await lookupItemCategories(admin, placementRows.map((r) => r.item_id));
      if (!cats.ok) return NextResponse.json({ error: cats.error }, { status: 400 });
      const valid = isBolster
        ? validateBolsterPlacements(rowsToBolsterPlacements(placementRows), cats.byId)
        : validatePillowPlacements(rowsToPillowPlacements(placementRows), cats.byId);
      if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    }
  }

  const lifecycle = transitionResult(
    {
      status: "held",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
    },
    { action: "assign", filling_template_id: input.fillingTemplateId },
  );
  if (!lifecycle.ok) {
    return NextResponse.json({ error: lifecycle.error }, { status: 400 });
  }

  const composed = await loadComposedSellable(
    admin,
    productType === "pillow"
      ? { productType: "pillow", size: assignedSize!, tier: assignedTier! }
      : { productType: "bolster", length: assignedLength! },
  );
  if (!composed.ok) {
    return NextResponse.json({ error: composed.error }, { status: 400 });
  }

  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];

  const { data: tplLines, error: linesErr } = await admin
    .from("bom_template_lines")
    .select("item_id, quantity")
    .eq("template_id", input.fillingTemplateId);
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  const composedBomRaw = composed.sellable.bomLines;

  // Filling pack: flatten of the saved snapshot when provided, else the template's flat lines.
  const fillPack = derivePackList(placementRows ?? [], tplLines ?? []);
  const fillItemIds = fillPack.map((l) => l.item_id);
  const allItemIds = [
    ...new Set([
      ...composedBomRaw.map((l) => l.item_id),
      ...fillItemIds,
      ...preferenceLines.map((l) => l.item_id),
      ...addonLines.map((l) => l.item_id),
    ]),
  ];

  const [{ data: items }, { data: balances }, { data: itemPrices }] = await Promise.all([
    allItemIds.length
      ? admin.from("items").select("id, name, subtype, category, price_family").in("id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ id: number; name: string; subtype: string | null; category: string }> }),
    allItemIds.length
      ? admin.from("inventory_balances").select("item_id, on_hand").in("item_id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; on_hand: number }> }),
    allItemIds.length
      ? admin.from("item_prices").select("item_id, msrp, cost").in("item_id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; msrp: number | null; cost: number | null }> }),
  ]);

  const itemById = new Map(
    (items ?? []).map((i) => [i.id as number, i as { id: number; name: string; subtype: string | null; category: string }]),
  );
  const nameByItem = new Map(
    [...itemById.entries()].map(([id, i]) => [id, itemLabel(i.name, i.subtype)]),
  );
  const onHandByItem = new Map(
    (balances ?? []).map((b) => [b.item_id as number, Number(b.on_hand)]),
  );
  const costByItem = new Map<number, number>();
  const msrpByItem = new Map<number, number>();
  for (const p of itemPrices ?? []) {
    if (p.cost != null) costByItem.set(p.item_id, Number(p.cost));
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }

  const fillingTemplateLines = fillPack.map((l) => ({
    item_id: l.item_id,
    quantity: l.count,
    category: itemById.get(l.item_id)?.category ?? "unknown",
  }));

  const assembled = assembleBuild({
    composedBomLines: composedBomRaw,
    fillingTemplateLines,
    preferenceLines,
    addonLines,
    costByItem,
  });
  if (!assembled.ok) {
    return NextResponse.json({ error: assembled.error }, { status: 400 });
  }

  // Customer still to pick cover and case (ADR 0017): the BOM's defaults are
  // placeholders, so their stock must not block assignment. The finish route
  // and accept both re-check stock against what the customer actually chose.
  const finishLater = needsCustomerFinish(row);
  const shortages = findStockShortages(
    finishLater
      ? assembled.lines.filter((l) => !(l.role === "composed" && preferenceRoleOf(l.category ?? "")))
      : assembled.lines,
    onHandByItem,
    nameByItem,
  );
  if (shortages.length > 0) {
    const detail = shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Insufficient stock to assign: ${detail}`, shortages },
      { status: 409 },
    );
  }

  // Final amount, always. A Result with no Authorization hold still has a
  // price — the whole total, owed by Balance payment — and `authorized` falls
  // out null, which is what tells the email which voice to use.
  const familyByItem = new Map<number, string | null>(
    (items ?? []).map((i) => [
      i.id as number,
      (i as { price_family?: string | null }).price_family ?? null,
    ]),
  );
  const { chosenCover, chosenCase } = resolvePreferences(preferenceLines, msrpByItem, familyByItem);
  const goods = priceComposedBuild({
    msrpByFamily: composed.sellable.msrpByFamily,
    defaultCover: composed.sellable.defaultCover,
    defaultCase: composed.sellable.defaultCase,
    caseOptions: composed.sellable.caseOptions,
    chosenCover,
    chosenCase,
    addonLines: addonLines.map((l) => ({
      msrp: msrpByItem.get(l.item_id) ?? null,
      quantity: l.quantity,
    })),
  });
  if (!goods.ok) {
    console.error(`[results/assign] pricing not usable (${goods.code}): ${goods.error}`);
    return NextResponse.json(
      { error: "This build cannot be priced yet. Check Costings." },
      { status: 409 },
    );
  }

  let shippingAmount = 0;
  let taxAmount = 0;
  const address = row.shipping_address as { country?: string } | null;
  if (row.shipping_method) {
    const { data: shippingRow } = await admin
      .from("shipping_methods")
      .select("*")
      .eq("slug", row.shipping_method)
      .maybeSingle();
    if (shippingRow) {
      shippingAmount = calculateShippingRate(shippingRow as ShippingMethod, goods.subtotal);
      const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
      taxAmount = computeTax(
        { subtotal: goods.subtotal, shippingAmount, discountAmount: 0 },
        taxRule,
      ).taxAmount;
    }
  }

  const priced = priceResult({
    subtotal: goods.subtotal,
    shipping: shippingAmount,
    tax: taxAmount,
  });
  const finalAmount = priced.total;
  const pricingBreakdown: ResultPricing = {
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    tax: priced.tax,
    total: priced.total,
    currency: composed.sellable.currency ?? row.currency ?? "SGD",
    // Null with no hold — and that null is what makes the assigned email ask
    // for a Balance payment instead of an accept/decline.
    authorized:
      row.authorized_amount != null ? Number(row.authorized_amount) : null,
  };

  // Divergence rule (PRD): keep filling_template_id only while the snapshot exactly
  // matches the confirmed template's current placements; snapshot rows always persist.
  let persistedTemplateId: number | null = input.fillingTemplateId;
  let fingerprint: string | null | undefined;
  if (placementRows) {
    const decision = decideFillingAssign({
      confirmedTemplateId: input.fillingTemplateId,
      saved: toPlacements(placementRows),
      templatePlacements: toPlacements(tplPlacementRows),
    });
    persistedTemplateId = decision.fillingTemplateId;
    fingerprint = decision.fillingFingerprint;
  }

  const { error: updateErr } = await admin
    .from("mp_config_responses")
    .update({
      assigned_size: assignedSize,
      assigned_tier: assignedTier,
      assigned_length: assignedLength,
      filling_template_id: persistedTemplateId,
      final_amount: finalAmount,
      status: lifecycle.status,
      // Only touched when a spatial save happened; hold-create snapshots stay otherwise.
      ...(fingerprint !== undefined ? { filling_fingerprint: fingerprint } : {}),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Result snapshot: replace-insert (first write for guest Results). Bolster
  // snapshots land in their own table (own schema).
  if (placementRows) {
    const snapshotTable = isBolster ? "result_bolster_filling_placements" : "result_filling_placements";
    const { error: delErr } = await admin.from(snapshotTable).delete().eq("result_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    const { error: insErr } = await admin.from(snapshotTable).insert(
      placementRows.map((r) =>
        isBolster
          ? { result_id: id, slot: r.slot, item_id: r.item_id }
          : {
              result_id: id,
              section: r.section,
              sub_section: r.sub_section,
              slot: r.slot,
              item_id: r.item_id,
              row_index: r.row_index ?? null,
            },
      ),
    );
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const fillingSummary = fillingTemplateLines.map(
    (l) => `${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`} ×${l.quantity}`,
  );
  const preferenceLabels = preferenceLines.map(
    (l) =>
      `${l.category}: ${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`}`,
  );
  const addonLabels = addonLines.map(
    (l) => `${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`} ×${l.quantity}`,
  );

  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  if (row.customer_email && row.access_token) {
    emailStatus = await sendAssignedEmail({
      to: row.customer_email,
      resultId: id,
      accessToken: row.access_token,
      origin,
      size: assignedSize,
      tier: assignedTier,
      length: assignedLength,
      productType,
      fillingSummary,
      preferences: preferenceLabels,
      addons: addonLabels,
      pricing: pricingBreakdown,
      needsFinish: finishLater,
    });
  }

  return NextResponse.json({
    ok: true,
    resultId: id,
    status: lifecycle.status,
    assignedSize,
    assignedTier,
    assignedLength,
    fillingTemplateId: persistedTemplateId,
    fillingTemplateName: persistedTemplateId != null ? template.name : null,
    finalAmount,
    pricing: pricingBreakdown,
    emailStatus,
  });
}
