import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { priceResult } from "@/lib/result-pricing";
import { createHoldCheckout } from "@/lib/authorization-hold";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import {
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";
import {
  BOLSTER_LENGTHS,
  loadComposedSellable,
} from "@/lib/results/composed-sellable";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

const PreferenceLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
  category: z.enum(["cover", "case"]),
});

const AddonLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
});

const AddressSchema = z.object({
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().optional().nullable(),
  postal_code: z.string().min(1),
  country: z.string().length(2).default("SG"),
});

const HoldSchema = z
  .object({
    responseId: z.string().uuid().optional(),
    email: z.string().email(),
    measurements: z.record(z.string(), z.unknown()).optional(),
    productType: z.enum(["pillow", "bolster"]).default("pillow"),
    suggestedSize: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
    /** Customer-facing tier (basic | premium). Maps to pillow_products.kind in DB. */
    suggestedTier: z.enum(["basic", "premium"]).optional(),
    /** Bolster length key (short | medium | long). */
    suggestedLength: z.enum(BOLSTER_LENGTHS).optional(),
    preferenceLines: z.array(PreferenceLineSchema).min(1),
    addonLines: z.array(AddonLineSchema).default([]),
    shippingMethodId: z.string().uuid(),
    shippingAddress: AddressSchema,
  })
  .superRefine((v, ctx) => {
    if (v.productType === "pillow") {
      if (!v.suggestedSize) {
        ctx.addIssue({ code: "custom", message: "suggestedSize required for pillow", path: ["suggestedSize"] });
      }
      if (!v.suggestedTier) {
        ctx.addIssue({ code: "custom", message: "suggestedTier required for pillow", path: ["suggestedTier"] });
      }
    } else if (!v.suggestedLength) {
      ctx.addIssue({
        code: "custom",
        message: "suggestedLength required for bolster",
        path: ["suggestedLength"],
      });
    }
  });

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "skipped" as const;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, text }),
      cache: "no-store",
    });
    return res.ok ? ("sent" as const) : ("failed" as const);
  } catch {
    return "failed" as const;
  }
}

async function sendHeldEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string;
  origin: string;
  productType: "pillow" | "bolster";
  label: string;
  amount: number;
  currency: string;
}) {
  const statusUrl = `${opts.origin}/results/${opts.resultId}?token=${opts.accessToken}`;
  const productName = opts.productType === "bolster" ? "Mbolster" : "Mpillow";
  const subject = `Your ${productName} is under review`;
  const text = [
    `Thanks for submitting your custom ${productName}.`,
    "",
    opts.label,
    `Authorized amount: ${opts.currency} ${opts.amount.toFixed(2)} (not charged yet)`,
    "",
    "Track your review status:",
    statusUrl,
    "",
    "You will be able to accept or decline once an operator finishes review.",
  ].join("\n");
  const html = `<p>Thanks for submitting your custom ${productName}.</p>
<p>${opts.label}<br/>
Authorized amount: <strong>${opts.currency} ${opts.amount.toFixed(2)}</strong> (not charged yet)</p>
<p><a href="${statusUrl}">Track your review status</a></p>
<p>You will be able to accept or decline once an operator finishes review.</p>`;

  try {
    await getEmailTransport().send({
      to: opts.to,
      from: getDefaultFromAddress(),
      subject,
      text,
      html,
    });
    return "sent" as const;
  } catch (e) {
    console.error("Result held email failed", e);
    return "failed" as const;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = HoldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const admin = supabaseAdmin();
  const origin = new URL(req.url).origin;
  const productType = input.productType;

  // Preference categories only (cover/case) — reject protector/filling at the boundary.
  for (const line of input.preferenceLines) {
    if (line.category !== "cover" && line.category !== "case") {
      return NextResponse.json(
        { error: "Customer preferences may only include cover and case" },
        { status: 400 },
      );
    }
  }

  const prefIds = input.preferenceLines.map((l) => l.item_id);
  const addonIds = input.addonLines.map((l) => l.item_id);
  const allItemIds = [...new Set([...prefIds, ...addonIds])];

  const composed = await loadComposedSellable(
    admin,
    productType === "pillow"
      ? {
          productType: "pillow",
          size: input.suggestedSize!,
          tier: input.suggestedTier!,
        }
      : { productType: "bolster", length: input.suggestedLength! },
  );
  if (!composed.ok) {
    return NextResponse.json({ error: composed.error }, { status: 400 });
  }

  const [{ data: items }, { data: prices }, { data: shippingRow }] = await Promise.all([
    allItemIds.length
      ? admin.from("items").select("id, category").in("id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ id: number; category: string }> }),
    allItemIds.length
      ? admin.from("item_prices").select("item_id, msrp").in("item_id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; msrp: number | null }> }),
    admin
      .from("shipping_methods")
      .select("*")
      .eq("id", input.shippingMethodId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!shippingRow) {
    return NextResponse.json({ error: "Invalid shipping method" }, { status: 400 });
  }

  const itemById = new Map((items ?? []).map((i) => [i.id as number, i]));
  for (const line of input.preferenceLines) {
    const item = itemById.get(line.item_id);
    if (!item || !itemMatchesPreferenceRole(String(item.category), line.category)) {
      return NextResponse.json(
        { error: `Invalid preference item ${line.item_id}` },
        { status: 400 },
      );
    }
  }
  for (const line of input.addonLines) {
    const item = itemById.get(line.item_id);
    const cat = String(item?.category ?? "");
    if (
      !item ||
      cat === "filling" ||
      isProtectorInventoryCategory(cat) ||
      isCaseInventoryCategory(cat)
    ) {
      return NextResponse.json(
        { error: `Invalid add-on item ${line.item_id}` },
        { status: 400 },
      );
    }
  }

  const msrpByItem = new Map<number, number>();
  for (const p of prices ?? []) {
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }

  const composedMsrp = composed.sellable.msrp;

  for (const l of input.addonLines) {
    if (msrpByItem.get(l.item_id) == null) {
      return NextResponse.json({ error: "Add-on missing Costings MSRP" }, { status: 400 });
    }
  }

  // ponytail: charge full preference MSRP for hold ballpark (may over-authorize slightly).
  const preferencePriced = input.preferenceLines.map((l) => ({
    msrp: msrpByItem.get(l.item_id) ?? 0,
    quantity: l.quantity,
  }));
  const addonPriced = input.addonLines.map((l) => ({
    msrp: msrpByItem.get(l.item_id)!,
    quantity: l.quantity,
  }));

  const shippingMethod = shippingRow as ShippingMethod;
  const prefSubtotal =
    preferencePriced.reduce((s, l) => s + l.msrp * l.quantity, 0) +
    addonPriced.reduce((s, l) => s + l.msrp * l.quantity, 0);
  const shippingAmount = calculateShippingRate(shippingMethod, composedMsrp + prefSubtotal);
  const taxRule = await resolveTaxRuleForRegion(input.shippingAddress.country);
  const tax = computeTax(
    { subtotal: composedMsrp + prefSubtotal, shippingAmount, discountAmount: 0 },
    taxRule,
  );

  const priced = priceResult({
    composedSellableMsrp: composedMsrp,
    preferenceLines: preferencePriced,
    addonLines: addonPriced,
    shipping: shippingAmount,
    tax: tax.taxAmount,
  });

  const currency = composed.sellable.currency;
  const accessToken = randomUUID();
  const resultId = input.responseId ?? randomUUID();

  const user = await getAuthUser();
  let customerId: string | null = null;
  if (user) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    customerId = customer?.id ?? null;
  }

  const preferenceLines = input.preferenceLines.map((l) => ({
    item_id: l.item_id,
    quantity: l.quantity,
    category: l.category,
  }));
  const addonLines = input.addonLines.map((l) => ({
    item_id: l.item_id,
    quantity: l.quantity,
  }));

  const row = {
    id: resultId,
    data: input.measurements ?? {},
    is_final: true,
    measured_by_type: "by_user" as const,
    product_type: productType,
    suggested_size: productType === "pillow" ? input.suggestedSize! : null,
    suggested_tier: productType === "pillow" ? input.suggestedTier! : null,
    suggested_length: productType === "bolster" ? input.suggestedLength! : null,
    preference_lines: preferenceLines,
    addon_lines: addonLines,
    shipping_method: shippingMethod.slug,
    shipping_address: input.shippingAddress,
    authorized_amount: priced.total,
    currency,
    payment_intent_id: null as string | null,
    status: "held",
    customer_email: input.email,
    customer_id: customerId,
    access_token: accessToken,
    source: "online_purchase",
  };

  const { error: upsertErr } = await admin.from("mp_config_responses").upsert(row, {
    onConflict: "id",
  });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // No inventory reserve or deduct on hold (US36).

  const cancelPath = productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const suggestLabel =
    productType === "bolster"
      ? `Length (suggested): ${input.suggestedLength}`
      : `Size×tier (suggested): ${input.suggestedSize} × ${input.suggestedTier}`;
  const description =
    productType === "bolster"
      ? `Mbolster ${input.suggestedLength} hold`
      : `Mpillow ${input.suggestedSize} ${input.suggestedTier} hold`;

  let checkout: { sessionId: string; url: string };
  try {
    checkout = await createHoldCheckout({
      amount: priced.total,
      currency,
      customerEmail: input.email,
      resultId,
      successUrl: `${origin}/results/${resultId}?token=${accessToken}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${cancelPath}?hold_cancelled=1`,
      description,
      metadata: { result_id: resultId },
      idempotencyKey: `result_hold_${resultId}`,
    });
  } catch (e) {
    console.error("Hold checkout failed", e);
    await admin.from("mp_config_responses").delete().eq("id", resultId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create authorization hold" },
      { status: 500 },
    );
  }

  const platformLink = `${origin}/settings/results/${resultId}`;
  const telegramStatus = await sendTelegram(
    [
      "💤 Held Result (online purchase) — review needed",
      suggestLabel,
      `Email: ${input.email}`,
      `Authorized: ${currency} ${priced.total.toFixed(2)}`,
      "",
      `Platform: ${platformLink}`,
    ].join("\n"),
  );

  const emailStatus = await sendHeldEmail({
    to: input.email,
    resultId,
    accessToken,
    origin,
    productType,
    label: suggestLabel,
    amount: priced.total,
    currency,
  });

  return NextResponse.json({
    ok: true,
    resultId,
    accessToken,
    authorizedAmount: priced.total,
    currency,
    checkoutUrl: checkout.url,
    telegramStatus,
    emailStatus,
  });
}
