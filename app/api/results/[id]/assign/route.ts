import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assembleBuild, findStockShortages } from "@/lib/build-assembly";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { transitionResult } from "@/lib/result-lifecycle";
import { priceResult } from "@/lib/result-pricing";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

const AssignSchema = z.object({
  assignedSize: z.enum(PILLOW_SIZES).optional(),
  assignedTier: z.enum(["basic", "premium"]).optional(),
  assignedLength: z.string().min(1).max(40).optional(),
  fillingTemplateId: z.number().int().positive(),
});

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

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
  pricing: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
    authorized: number | null;
  } | null;
}) {
  const statusUrl = `${opts.origin}/results/${opts.resultId}?token=${opts.accessToken}`;
  const sizeLine =
    opts.productType === "bolster"
      ? `Length: ${opts.length ?? "—"}`
      : `Size: ${opts.size ?? "—"} · Tier: ${opts.tier ?? "—"}`;
  const priceLines = opts.pricing
    ? [
        `Subtotal: ${opts.pricing.currency} ${opts.pricing.subtotal.toFixed(2)}`,
        `Shipping: ${opts.pricing.currency} ${opts.pricing.shipping.toFixed(2)}`,
        `Tax: ${opts.pricing.currency} ${opts.pricing.tax.toFixed(2)}`,
        `Total: ${opts.pricing.currency} ${opts.pricing.total.toFixed(2)}`,
        opts.pricing.authorized != null
          ? `Authorized hold: ${opts.pricing.currency} ${opts.pricing.authorized.toFixed(2)}`
          : null,
      ].filter(Boolean)
    : [];

  const text = [
    "Your final Mpillow build is ready for review.",
    "",
    sizeLine,
    `Fillings: ${opts.fillingSummary.join(", ") || "—"}`,
    `Preferences: ${opts.preferences.join(", ") || "—"}`,
    `Add-ons: ${opts.addons.join(", ") || "—"}`,
    ...priceLines,
    "",
    "Review and accept or decline:",
    statusUrl,
  ].join("\n");

  const html = `<p>Your final Mpillow build is ready for review.</p>
<p>${sizeLine}<br/>
Fillings: <strong>${opts.fillingSummary.join(", ") || "—"}</strong><br/>
Preferences: <strong>${opts.preferences.join(", ") || "—"}</strong><br/>
Add-ons: <strong>${opts.addons.join(", ") || "—"}</strong></p>
${
  opts.pricing
    ? `<p>Subtotal: ${opts.pricing.currency} ${opts.pricing.subtotal.toFixed(2)}<br/>
Shipping: ${opts.pricing.currency} ${opts.pricing.shipping.toFixed(2)}<br/>
Tax: ${opts.pricing.currency} ${opts.pricing.tax.toFixed(2)}<br/>
<strong>Total: ${opts.pricing.currency} ${opts.pricing.total.toFixed(2)}</strong></p>`
    : ""
}
<p><a href="${statusUrl}">Review your final build</a></p>
<p>Accept or decline on the status page. Accept captures payment; Decline releases your hold.</p>`;

  try {
    await getEmailTransport().send({
      to: opts.to,
      from: getDefaultFromAddress(),
      subject: "Your final build is ready",
      text,
      html,
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
      "id, status, product_type, suggested_size, suggested_tier, suggested_length, preference_lines, addon_lines, shipping_method, shipping_address, authorized_amount, currency, payment_intent_id, filling_template_id, customer_email, access_token",
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
  const assignedLength =
    productType === "bolster"
      ? (input.assignedLength ?? (row.suggested_length as string | null))
      : null;

  if (productType === "pillow") {
    if (!assignedSize || !assignedTier) {
      return NextResponse.json(
        { error: "Pillow assignment requires size and tier" },
        { status: 400 },
      );
    }
  } else if (!assignedLength) {
    return NextResponse.json(
      { error: "Bolster assignment requires length" },
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

  // Composed sellable for assigned size×tier (pillow) or length (bolster).
  let composedProductId: number | null = null;
  if (productType === "pillow") {
    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", assignedSize!)
      .eq("kind", assignedTier!)
      .eq("is_active", true)
      .maybeSingle();
    if (!pillowProduct) {
      return NextResponse.json(
        {
          error: `No active composed sellable for size ${assignedSize} tier ${assignedTier}`,
        },
        { status: 400 },
      );
    }
    composedProductId = pillowProduct.id;
  }

  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];

  const { data: tplLines, error: linesErr } = await admin
    .from("bom_template_lines")
    .select("item_id, quantity")
    .eq("template_id", input.fillingTemplateId);
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  let composedBomRaw: Array<{ item_id: number; quantity: number; category: string }> = [];
  if (composedProductId != null) {
    const { data: bomLines, error: bomErr } = await admin
      .from("bom_lines")
      .select("item_id, quantity, items!inner(category)")
      .eq("product_id", composedProductId);
    if (bomErr) return NextResponse.json({ error: bomErr.message }, { status: 500 });
    composedBomRaw = (bomLines ?? []).map((l) => {
      const items = l.items as unknown as { category: string } | { category: string }[];
      const category = Array.isArray(items) ? items[0]?.category : items?.category;
      return {
        item_id: l.item_id as number,
        quantity: Number(l.quantity),
        category: String(category ?? "unknown"),
      };
    });
  }

  const fillItemIds = (tplLines ?? []).map((l) => l.item_id as number);
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
      ? admin.from("items").select("id, name, subtype, category").in("id", allItemIds)
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

  const fillingTemplateLines = (tplLines ?? []).map((l) => ({
    item_id: l.item_id as number,
    quantity: Number(l.quantity),
    category: itemById.get(l.item_id as number)?.category ?? "unknown",
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

  const shortages = findStockShortages(assembled.lines, onHandByItem, nameByItem);
  if (shortages.length > 0) {
    const detail = shortages
      .map((s) => `${s.name}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return NextResponse.json(
      { error: `Insufficient stock to assign: ${detail}`, shortages },
      { status: 409 },
    );
  }

  // Final amount when a hold exists (online purchase path).
  let finalAmount: number | null = null;
  let pricingBreakdown: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
    currency: string;
    authorized: number | null;
  } | null = null;

  const hasHold = row.payment_intent_id != null || row.authorized_amount != null;
  if (hasHold && productType === "pillow" && composedProductId != null) {
    const { data: productPrice } = await admin
      .from("product_prices")
      .select("msrp, currency")
      .eq("kind", "pillow")
      .eq("product_id", composedProductId)
      .maybeSingle();
    const composedMsrp = productPrice?.msrp != null ? Number(productPrice.msrp) : null;
    if (composedMsrp == null) {
      return NextResponse.json(
        { error: "Composed sellable has no Costings MSRP" },
        { status: 400 },
      );
    }

    const preferencePriced = preferenceLines.map((l) => ({
      msrp: msrpByItem.get(l.item_id) ?? 0,
      quantity: l.quantity,
    }));
    const addonPriced = addonLines.map((l) => ({
      msrp: msrpByItem.get(l.item_id) ?? 0,
      quantity: l.quantity,
    }));

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
        const prefSubtotal =
          preferencePriced.reduce((s, l) => s + l.msrp * l.quantity, 0) +
          addonPriced.reduce((s, l) => s + l.msrp * l.quantity, 0);
        shippingAmount = calculateShippingRate(
          shippingRow as ShippingMethod,
          composedMsrp + prefSubtotal,
        );
        const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
        taxAmount = computeTax(
          {
            subtotal: composedMsrp + prefSubtotal,
            shippingAmount,
            discountAmount: 0,
          },
          taxRule,
        ).taxAmount;
      }
    }

    const priced = priceResult({
      composedSellableMsrp: composedMsrp,
      preferenceLines: preferencePriced,
      addonLines: addonPriced,
      shipping: shippingAmount,
      tax: taxAmount,
    });
    finalAmount = priced.total;
    pricingBreakdown = {
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      tax: priced.tax,
      total: priced.total,
      currency: (productPrice?.currency as string) ?? row.currency ?? "SGD",
      authorized:
        row.authorized_amount != null ? Number(row.authorized_amount) : null,
    };
  }

  const { error: updateErr } = await admin
    .from("mp_config_responses")
    .update({
      assigned_size: assignedSize,
      assigned_tier: assignedTier,
      assigned_length: assignedLength,
      filling_template_id: input.fillingTemplateId,
      final_amount: finalAmount,
      status: lifecycle.status,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
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
    });
  }

  return NextResponse.json({
    ok: true,
    resultId: id,
    status: lifecycle.status,
    assignedSize,
    assignedTier,
    assignedLength,
    fillingTemplateId: input.fillingTemplateId,
    fillingTemplateName: template.name,
    finalAmount,
    pricing: pricingBreakdown,
    emailStatus,
  });
}
