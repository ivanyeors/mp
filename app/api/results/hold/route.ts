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
import { renderResultHeldEmail } from "@/lib/email/results";
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
import { normalizePhone } from "@/lib/appointments/phone";
import {
  getDiscoverySourceCatalog,
  normalizeDiscoverySourceOther,
  validateDiscoverySource,
} from "@/lib/discovery-source";
import {
  isWithinReferralWindow,
  resolveAttribution,
} from "@/lib/referrals/attribution";
import { getPartnerByReferralCode } from "@/lib/referrals";
import { VISITOR_COOKIE, parseVisitorId } from "@/lib/analytics/journey/identity";
import { preferenceCategoryAllowed } from "@/lib/configurator/preference-policy";
import {
  loadPreOrderTriggerAtHold,
  preOrderFlagForResult,
} from "@/lib/configurator/pre-order-persist";
import { getAdminContext } from "@/lib/auth/admin";
import {
  MAX_LAYERS_PER_CELL,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  validateBolsterPlacements,
  validatePillowPlacements,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";
import {
  buildBolsterFillingSnapshot,
  buildFillingSnapshot,
  type BolsterFillingSnapshot,
  type FillingSnapshot,
} from "@/lib/results/filling-snapshot";
import {
  assertPreStripeRouteResolved,
  inputsFromBolsterHeight,
  inputsFromMpConfigData,
  parseRecommendationRecord,
  recommendWithEngine,
  toPersistedRecommendationRecord,
} from "@/lib/rules-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

/** Customer-facing message when a configuration's price isn't set up in Costings yet. */
const PRICING_UNAVAILABLE_MESSAGE =
  "This configuration isn’t available for purchase yet. Please contact us to complete your order.";

const PreferenceLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
  category: z.enum(["cover", "case"]),
});

const AddonLineSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive().default(1),
});

/** Staff assist spatial mix (slices 05/13). Shape gate — the per-kind lib validation
 * does the rest (bolster rows carry no cell address; pillow validation rejects ""). */
const AssistFillingSchema = z.object({
  placements: z
    .array(
      z.object({
        section: z.string().default(""),
        sub_section: z.string().default(""),
        slot: z.number().int(),
        item_id: z.number().int().positive(),
        // The piece's LAYER (0 = top/front). Without this, zod strips it and
        // every layered cell the configurator built persists to
        // result_filling_placements with depth NULL.
        row_index: z.number().int().min(0).max(MAX_LAYERS_PER_CELL - 1).nullable().optional(),
      }),
    )
    .min(1),
  /** Client's still-matching template claim — re-verified server-side, never trusted alone. */
  templateId: z.number().int().positive().nullable().optional(),
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
    phone: z.string().min(1),
    discoverySource: z.string().min(1),
    discoverySourceOther: z.string().optional(),
    /** Optional typed "Partner / referral code". Invalid never blocks the hold. */
    referralCode: z.string().trim().optional(),
    /**
     * Partner-assisted run (#78): the launching partner's own referral code. The
     * server RE-RESOLVES this to a partner id (never trust a client id) and gives
     * it ASSIST priority, outranking a typed code / windowed link stamp.
     */
    partnerAssistCode: z.string().trim().optional(),
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
    /** Present only for Staff assist holds; guests send nothing. */
    assistFilling: AssistFillingSchema.optional(),
    /** Locale-less return path when Stripe checkout is cancelled (default: /mp-config or /mbolster-config). */
    cancelPath: z.string().regex(/^\//).optional(),
    /** Client journey-resolved recommendation record (entry→final flow + route decision). */
    recommendationRecord: z.record(z.string(), z.unknown()).optional(),
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
    v.preferenceLines.forEach((line, index) => {
      if (!preferenceCategoryAllowed(v.productType, line.category)) {
        ctx.addIssue({
          code: "custom",
          message: "Bolster preferences may only include a case",
          path: ["preferenceLines", index, "category"],
        });
      }
    });
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

/** Best-effort "under review" notice. Rendering lives in lib/email/results.ts. */
async function sendHeldEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string;
  origin: string;
  productType: "pillow" | "bolster";
  label: string;
  /** Null for an Assisted customisation — no card, so no authorized amount. */
  amount: number | null;
  currency: string;
}) {
  try {
    await getEmailTransport().send({
      to: opts.to,
      from: getDefaultFromAddress(),
      ...renderResultHeldEmail(opts),
    });
    return "sent" as const;
  } catch (e) {
    console.error("Result held email failed", e);
    return "failed" as const;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
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

  const phoneNormalized = normalizePhone(input.phone);
  if (!phoneNormalized) {
    return NextResponse.json(
      { error: "Invalid phone", field: "phone" },
      { status: 400 },
    );
  }

  const catalog = await getDiscoverySourceCatalog();
  const discoveryErr = validateDiscoverySource(
    {
      discoverySource: input.discoverySource,
      discoverySourceOther: input.discoverySourceOther,
    },
    catalog,
  );
  if (discoveryErr) {
    return NextResponse.json(
      { error: discoveryErr.message, field: discoveryErr.field },
      { status: 400 },
    );
  }
  const discoverySourceOther = normalizeDiscoverySourceOther(
    input.discoverySource,
    input.discoverySourceOther,
  );

  // Staff assist snapshot (slices 05/13): staff-gated, validated per product kind,
  // template claim re-verified against the catalog's current placements. Guests
  // never reach this. Bolster uses its own schema — never the pillow enums.
  let fillingSnapshot: FillingSnapshot | BolsterFillingSnapshot | null = null;
  const snapshotTable =
    productType === "bolster" ? "result_bolster_filling_placements" : "result_filling_placements";
  if (input.assistFilling) {
    const staff = await getAdminContext();
    if (!staff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const placementItemIds = [...new Set(input.assistFilling.placements.map((p) => p.item_id))];
    const { data: fillingItems } = await admin
      .from("items")
      .select("id, category")
      .in("id", placementItemIds);
    const itemCategories = new Map(
      (fillingItems ?? []).map((i) => [i.id as number, String(i.category)]),
    );
    const claimedTemplateId = input.assistFilling.templateId ?? null;

    if (productType === "bolster") {
      const placements = rowsToBolsterPlacements(input.assistFilling.placements);
      const valid = validateBolsterPlacements(placements, itemCategories);
      if (!valid.ok) {
        return NextResponse.json({ error: valid.error }, { status: 400 });
      }
      let templatePlacements: BolsterPlacement[] | null = null;
      if (claimedTemplateId != null) {
        const { data: tplRows } = await admin
          .from("bolster_template_placements")
          .select("slot, item_id")
          .eq("template_id", claimedTemplateId);
        templatePlacements = rowsToBolsterPlacements((tplRows ?? []) as BolsterPlacementRow[]);
      }
      fillingSnapshot = buildBolsterFillingSnapshot({
        placements,
        claimedTemplateId,
        templatePlacements,
      });
    } else {
      const placements = rowsToPillowPlacements(input.assistFilling.placements);
      const valid = validatePillowPlacements(placements, itemCategories);
      if (!valid.ok) {
        return NextResponse.json({ error: valid.error }, { status: 400 });
      }
      let templatePlacements: PillowPlacement[] | null = null;
      if (claimedTemplateId != null) {
        const { data: tplRows } = await admin
          .from("filling_template_placements")
          .select("section, sub_section, slot, item_id")
          .eq("template_id", claimedTemplateId);
        templatePlacements = rowsToPillowPlacements((tplRows ?? []) as PillowPlacementRow[]);
      }
      fillingSnapshot = buildFillingSnapshot({ placements, claimedTemplateId, templatePlacements });
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
    if (composed.code === "no_price") {
      console.error(`[results/hold] pricing not configured: ${composed.error}`);
      return NextResponse.json({ error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" }, { status: 409 });
    }
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
      console.error(`[results/hold] pricing not configured: add-on item ${l.item_id} missing Costings MSRP`);
      return NextResponse.json({ error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" }, { status: 409 });
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

  // Sticky Pre-order at hold create — recompute from inventory (ADR 0005).
  const is_pre_order = preOrderFlagForResult(
    await loadPreOrderTriggerAtHold(admin, {
      productType,
      preferenceItemIds: preferenceLines.map((l) => l.item_id),
      suggestedSize: input.suggestedSize,
      suggestedTier: input.suggestedTier,
      suggestedLength: input.suggestedLength,
    }),
  );

  // Recommendation record at hold: client journey wins, else response copy, else recompute.
  // Guest filling snapshot stays null.
  let recommendation_record: Record<string, unknown> | null =
    input.recommendationRecord && typeof input.recommendationRecord === "object"
      ? input.recommendationRecord
      : null;
  if (!recommendation_record && input.responseId) {
    const { data: prior } = await admin
      .from("mp_config_responses")
      .select("recommendation_record")
      .eq("id", input.responseId)
      .maybeSingle();
    if (prior?.recommendation_record && typeof prior.recommendation_record === "object") {
      recommendation_record = prior.recommendation_record as Record<string, unknown>;
    }
  }
  if (!recommendation_record) {
    const measurements = (input.measurements ?? {}) as Record<string, unknown>;
    const engineResult =
      productType === "bolster"
        ? await recommendWithEngine(
            "mbolster",
            inputsFromBolsterHeight(Number(measurements.height_cm)),
          )
        : await recommendWithEngine(
            input.suggestedTier === "basic" ? "basic-mpillow" : "premium-mpillow",
            inputsFromMpConfigData(measurements),
          );
    if (!("error" in engineResult)) {
      recommendation_record = toPersistedRecommendationRecord(engineResult);
    }
  }

  const routeGate = assertPreStripeRouteResolved(
    parseRecommendationRecord(recommendation_record) ?? { flowRoute: null },
  );
  if (!routeGate.ok) {
    return NextResponse.json({ error: routeGate.reason }, { status: 409 });
  }

  // Referral attribution (#74/#78): assist > typed > windowed link stamp.
  // A partner-assisted run (#78) re-resolves the launch code server-side and
  // wins over any typed code / link. Discovery source never attributes.
  // STAMP only — no commission.
  const assistPartner = input.partnerAssistCode
    ? await getPartnerByReferralCode(input.partnerAssistCode)
    : null;
  const typedPartner = input.referralCode
    ? await getPartnerByReferralCode(input.referralCode)
    : null;
  let linkPartnerId: string | null = null;
  let linkRefCode: string | null = null;
  const visitorId = parseVisitorId(readCookie(req, VISITOR_COOKIE));
  if (visitorId) {
    const { data: visitor } = await admin
      .from("analytics_visitors")
      .select("ref_code, ref_stamped_at")
      .eq("id", visitorId)
      .maybeSingle();
    if (
      visitor?.ref_code &&
      isWithinReferralWindow(visitor.ref_stamped_at as string | null, new Date())
    ) {
      const linkPartner = await getPartnerByReferralCode(visitor.ref_code as string);
      if (linkPartner) {
        linkPartnerId = linkPartner.id;
        linkRefCode = linkPartner.referral_code;
      }
    }
  }
  const attribution = resolveAttribution({
    assistPartnerId: assistPartner?.id ?? null,
    typedPartnerId: typedPartner?.id ?? null,
    linkPartnerId,
  });
  const attributedRefCode =
    attribution.source === "assist"
      ? assistPartner?.referral_code ?? null
      : attribution.source === "typed"
        ? typedPartner?.referral_code ?? null
        : attribution.source === "link"
          ? linkRefCode
          : null;

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
    customer_phone: phoneNormalized,
    discovery_source: input.discoverySource,
    discovery_source_other: discoverySourceOther,
    partner_id: attribution.partnerId,
    ref_code: attributedRefCode,
    // How it attributed (assist>typed>link) — #80 reads this for PDPA masking.
    attribution_source: attribution.source,
    customer_id: customerId,
    access_token: accessToken,
    source: "online_purchase",
    is_pre_order,
    ...(recommendation_record ? { recommendation_record } : {}),
    // Only assist holds carry snapshot columns; guest rows stay untouched (null snapshot).
    ...(fillingSnapshot
      ? {
          filling_fingerprint: fillingSnapshot.fingerprint,
          filling_template_id: fillingSnapshot.fillingTemplateId,
        }
      : {}),
  };

  const { error: upsertErr } = await admin.from("mp_config_responses").upsert(row, {
    onConflict: "id",
  });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  if (fillingSnapshot) {
    // Replace-insert copy rows keyed by result — no FK to template placements, so
    // later catalog template edits never change this Result (ADR 0008). Bolster
    // rows land in their own table (own schema).
    const { error: delErr } = await admin
      .from(snapshotTable)
      .delete()
      .eq("result_id", resultId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    const { error: insErr } = await admin
      .from(snapshotTable)
      .insert(fillingSnapshot.rows.map((r) => ({ result_id: resultId, ...r })));
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // No inventory reserve or deduct on hold (US36).

  const cancelPath =
    input.cancelPath ??
    (productType === "bolster" ? "/mbolster-config" : "/mp-config");
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

  // ponytail: slice 04 built the no-card voice of this email — pass
  // `amount: null` and renderResultHeldEmail drops the authorized-amount panel
  // and promises a price by email instead. There is no deferred (no-card)
  // submit branch here yet; slice 03 owns building it and wiring this call.
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
