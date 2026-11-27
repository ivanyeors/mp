import { NextResponse } from "next/server";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import { secretMatches } from "@/lib/auth/secret";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { requireResultAccess } from "@/lib/results/access";
import { priceResult } from "@/lib/result-pricing";
import { round2 } from "@/lib/commissions";
import { placedChargeLines, priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { loadResultServiceLines, sumServiceLines } from "@/lib/pricing/service-lines";
import { actingProfile } from "@/lib/staff/working-as";
import { createHoldCheckout } from "@/lib/authorization-hold";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { getEmailTransport } from "@/lib/email";
import { customerForCustomisation } from "@/lib/crm/customisation-customer";
import { sendTelegram, type TelegramStatus } from "@/lib/telegram/notify";
import { renderOnlineResultHeld } from "@/lib/crm/telegram-updates";
import { isOnlineResultNoticeOn } from "@/lib/crm/telegram-updates-server";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { RESULT_EMAIL_COPY, renderResultHeldEmail } from "@/lib/email/results";
import {
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";
import {
  BOLSTER_LENGTHS,
  loadComposedSellable,
  type ComposedSellableKey,
} from "@/lib/results/composed-sellable";
import { priceCompanionBolster } from "@/lib/results/paired-hold";
import { quoteResultShipping, resultShippingAmount } from "@/lib/results/shipping";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import { AddonLineSchema, PreferenceLineSchema } from "@/lib/results/finish-schemas";
import { ShippingAddressInputSchema, resolveShippingAddress } from "@/lib/shipping/self-collect";
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
import { getPartnerByReferralCode, isSelfReferral } from "@/lib/referrals";
import { commissionInEffect, referralDiscountFor, sgtDate } from "@/lib/partner-terms";
import { getPartnerContext } from "@/lib/auth/partner";
import {
  CHECKOUT_CODE_MAX_LENGTH,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE,
  checkoutCodeRateLimited,
  couponAccount,
  resolveCheckoutCode,
} from "@/lib/checkout-code";
import { checkCoupon } from "@/lib/ecommerce/discounts";
import {
  couponTermsOf,
  resultCouponLineItems,
  resultCouponPricing,
  type ResultCouponTerms,
} from "@/lib/results/discount";
import { VISITOR_COOKIE, parseVisitorId } from "@/lib/analytics/journey/identity";
import { stitchShopperVisitor } from "@/lib/analytics/journey/stitch-server";
import { preferenceCategoryAllowed } from "@/lib/configurator/preference-policy";
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import {
  loadPreOrderTriggerAtHold,
  preOrderFlagForResult,
} from "@/lib/configurator/pre-order-persist";
import { getAdminContext } from "@/lib/auth/admin";
import { getPublicOrigin } from "@/lib/site-url";
import { errorTextWithoutStripeRequestId } from "@/lib/stripe/error-text";
import {
  derivePackList,
  MAX_LAYERS_PER_CELL,
  MAX_OFFSET_MM,
  placementKind,
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

const PRICING_UNAVAILABLE_MESSAGE =
  "This configuration isn’t available for purchase yet. Please contact us to complete your order.";

const AssistFillingSchema = z.object({
  placements: z
    .array(
      z.object({
        section: z.string().default(""),
        sub_section: z.string().default(""),
        slot: z.number().int(),
        item_id: z.number().int().positive(),
        row_index: z.number().int().min(0).max(MAX_LAYERS_PER_CELL - 1).nullable().optional(),
        insert_order: z.number().int().min(1).nullable().optional(),
        offset_x_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
        offset_y_mm: z.number().int().min(-MAX_OFFSET_MM).max(MAX_OFFSET_MM).nullable().optional(),
      }),
    )
    .min(1),
  templateId: z.number().int().positive().nullable().optional(),
});

const PairedBolsterSchema = z.object({
  responseId: z.string().uuid(),
  suggestedLength: z.enum(BOLSTER_LENGTHS),
  measurements: z.record(z.string(), z.unknown()).optional(),
  preferenceLines: z.array(PreferenceLineSchema).min(1),
  addonLines: z.array(AddonLineSchema).default([]),
  recommendationRecord: z.record(z.string(), z.unknown()).optional(),
  assistFilling: AssistFillingSchema.optional(),
});

const HoldSchema = z
  .object({
    responseId: z.string().uuid().optional(),
    token: z.string().uuid().nullish(),
    email: z.string().email(),
    phone: z.string().min(1),
    discoverySource: z.string().min(1),
    discoverySourceOther: z.string().optional(),
    code: z.string().trim().max(CHECKOUT_CODE_MAX_LENGTH).optional(),
    referralCode: z.string().trim().optional(),
    partnerAssistCode: z.string().trim().optional(),
    deferred: z.boolean().optional(),
    measurements: z.record(z.string(), z.unknown()).optional(),
    productType: z.enum(["pillow", "bolster"]).default("pillow"),
    suggestedSize: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
    suggestedTier: z.enum(["basic", "premium"]).optional(),
    suggestedLength: z.enum(BOLSTER_LENGTHS).optional(),
    preferenceLines: z.array(PreferenceLineSchema).default([]),
    addonLines: z.array(AddonLineSchema).default([]),
    shippingMethodId: z.string().uuid().optional(),
    shippingAddress: ShippingAddressInputSchema.optional(),
    assistFilling: AssistFillingSchema.optional(),
    cancelPath: z.string().regex(/^\//).optional(),
    recommendationRecord: z.record(z.string(), z.unknown()).optional(),
    pairedBolster: PairedBolsterSchema.optional(),
    marketingEmail: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pairedBolster) {
      if (v.productType !== "pillow" || v.deferred || !v.responseId) {
        ctx.addIssue({
          code: "custom",
          message: "Only an Mpillow hold with a session can carry a paired Mbolster",
          path: ["pairedBolster"],
        });
      }
      if (v.pairedBolster.responseId === v.responseId) {
        ctx.addIssue({ code: "custom", message: "The paired Mbolster needs its own id", path: ["pairedBolster", "responseId"] });
      }
      v.pairedBolster.preferenceLines.forEach((line, index) => {
        if (!preferenceCategoryAllowed("bolster", line.category)) {
          ctx.addIssue({
            code: "custom",
            message: "Bolster preferences may only include a case",
            path: ["pairedBolster", "preferenceLines", index, "category"],
          });
        }
      });
    }
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
    if (!v.deferred) {
      if (v.preferenceLines.length === 0) {
        ctx.addIssue({ code: "custom", message: "Choose a cover and case", path: ["preferenceLines"] });
      }
      if (!v.shippingMethodId) {
        ctx.addIssue({ code: "custom", message: "Choose a shipping method", path: ["shippingMethodId"] });
      }
      if (!v.shippingAddress) {
        ctx.addIssue({ code: "custom", message: "Shipping address required", path: ["shippingAddress"] });
      }
    }
    if (Boolean(v.shippingMethodId) !== Boolean(v.shippingAddress)) {
      ctx.addIssue({
        code: "custom",
        message: "Shipping method and address go together",
        path: ["shippingAddress"],
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


async function sendHeldEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string;
  origin: string;
  productType: "pillow" | "bolster";
  label: string;
  amount: number | null;
  currency: string;
}) {
  try {
    const copy = await loadEmailCopy(RESULT_EMAIL_COPY.held);
    await getEmailTransport().send({
      to: opts.to,
      from: getDefaultFromAddress(),
      ...renderResultHeldEmail(opts, copy),
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
  const limited = await tooManyRequests([
    { bucket: "hold-ip", key: clientIp(req), windowMs: 60 * 60_000, max: 20 },
    { bucket: "hold-email", key: input.email.trim().toLowerCase(), windowMs: 60 * 60_000, max: 10 },
  ]);
  if (limited) return limited;
  if (input.code && (await checkoutCodeRateLimited(req))) {
    return NextResponse.json({ error: CHECKOUT_CODE_RATE_LIMITED_MESSAGE, field: "code" }, { status: 429 });
  }
  const admin = supabaseAdmin();
  const origin = getPublicOrigin(req);
  const productType = input.productType;

  const { data: assisted, error: assistedErr } = input.responseId
    ? await admin
        .from("mp_config_responses")
        .select(
          "source, status, access_token, customer_id, customer_email, order_id, payment_intent_id, measured_by_type, measured_by_staff_id, paired_build_id",
        )
        .eq("id", input.responseId)
        .maybeSingle()
    : { data: null, error: null };
  if (assistedErr) {
    return NextResponse.json({ error: assistedErr.message }, { status: 500 });
  }
  if (assisted) {
    const access = await requireResultAccess(assisted, input.token ?? null, {
      staffPermissions: ["results"],
    });
    if (!access.ok) return access.response;
  }
  if (
    (assisted?.status && ["assigned", "accepted", "captured"].includes(assisted.status)) ||
    (assisted?.status === "held" && assisted.payment_intent_id)
  ) {
    return NextResponse.json(
      { error: "This Result has already been submitted" },
      { status: 409 },
    );
  }
  if (input.deferred) {
    if (!input.responseId) {
      return NextResponse.json(
        { error: "A deferred submit needs an existing customisation session" },
        { status: 400 },
      );
    }
    if (!assisted || assisted.source !== "staff_assisted") {
      return NextResponse.json(
        { error: "This customisation cannot be submitted without payment" },
        { status: 403 },
      );
    }
    if (assisted.status != null) {
      return NextResponse.json(
        { error: "This Result has already been submitted" },
        { status: 409 },
      );
    }
  }

  const paired = input.pairedBolster ?? null;
  let companionPrior: { status: string | null } | null = null;
  if (paired) {
    const { data, error } = await admin
      .from("mp_config_responses")
      .select("status, paired_build_id, payment_intent_id")
      .eq("id", paired.responseId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data && (data.paired_build_id !== input.responseId || data.status !== "held" || data.payment_intent_id)) {
      return NextResponse.json({ error: "This Mbolster has already been submitted" }, { status: 409 });
    }
    companionPrior = data;
  }

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
      .select("id, category, name")
      .in("id", placementItemIds);
    const itemCategories = new Map(
      (fillingItems ?? []).map((i) => [
        i.id as number,
        placementKind({ category: String(i.category), name: String(i.name) }),
      ]),
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
      const valid = validatePillowPlacements(placements, itemCategories, { tier: input.suggestedTier });
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

  let companionSnapshot: BolsterFillingSnapshot | null = null;
  if (paired?.assistFilling) {
    if (!(await getAdminContext())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ids = [...new Set(paired.assistFilling.placements.map((p) => p.item_id))];
    const { data: companionItems } = await admin.from("items").select("id, category, name").in("id", ids);
    const companionKinds = new Map(
      (companionItems ?? []).map((i) => [
        i.id as number,
        placementKind({ category: String(i.category), name: String(i.name) }),
      ]),
    );
    const placements = rowsToBolsterPlacements(paired.assistFilling.placements);
    const valid = validateBolsterPlacements(placements, companionKinds);
    if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
    const claimed = paired.assistFilling.templateId ?? null;
    let templatePlacements: BolsterPlacement[] | null = null;
    if (claimed != null) {
      const { data: tplRows } = await admin
        .from("bolster_template_placements")
        .select("slot, item_id")
        .eq("template_id", claimed);
      templatePlacements = rowsToBolsterPlacements((tplRows ?? []) as BolsterPlacementRow[]);
    }
    companionSnapshot = buildBolsterFillingSnapshot({ placements, claimedTemplateId: claimed, templatePlacements });
  }

  const prefIds = input.preferenceLines.map((l) => l.item_id);
  const addonIds = input.addonLines.map((l) => l.item_id);
  const placedPack = derivePackList(input.assistFilling?.placements ?? [], []);
  const allItemIds = [...new Set([...prefIds, ...addonIds, ...placedPack.map((l) => l.item_id)])];

  const composedKey: ComposedSellableKey =
    productType === "pillow"
      ? {
          productType: "pillow",
          size: input.suggestedSize!,
          tier: input.suggestedTier!,
        }
      : { productType: "bolster", length: input.suggestedLength! };
  const composed = await loadComposedSellable(admin, composedKey);
  if (!composed.ok) {
    if (composed.code) {
      console.error(`[results/hold] pricing not usable (${composed.code}): ${composed.error}`);
      return NextResponse.json({ error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" }, { status: 409 });
    }
    return NextResponse.json({ error: composed.error }, { status: 400 });
  }

  const [{ data: items }, { data: prices }, { data: shippingRow }] = await Promise.all([
    allItemIds.length
      ? admin.from("items").select("id, category, name, price_family").in("id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ id: number; category: string; name: string }> }),
    allItemIds.length
      ? admin.from("item_prices").select("item_id, msrp").in("item_id", allItemIds)
      : Promise.resolve({ data: [] as Array<{ item_id: number; msrp: number | null }> }),
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
  const shippingAddress =
    shippingRow && input.shippingAddress
      ? await resolveShippingAddress(admin, shippingRow, input.shippingAddress)
      : null;
  if (shippingAddress && !shippingAddress.ok) {
    return NextResponse.json({ error: shippingAddress.error }, { status: shippingAddress.status });
  }
  const shippingCountry = shippingAddress?.ok ? shippingAddress.address.country : "SG";
  let shippingRate: number | null = null;
  if (shippingRow && shippingAddress?.ok) {
    const quoted = await quoteResultShipping(admin, {
      method: shippingRow as ShippingMethod,
      parcelTypes: paired ? ["pillow", "bolster"] : [productType],
      destination: shippingAddress.address,
    });
    if (!quoted.ok) return NextResponse.json({ error: quoted.error }, { status: 400 });
    shippingRate = quoted.rate;
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

  const familyByItem = new Map<number, string | null>(
    (items ?? []).map((i) => [
      i.id as number,
      (i as { price_family?: string | null }).price_family ?? null,
    ]),
  );
  const { chosenCover, chosenCase } = resolvePreferences(input.preferenceLines, msrpByItem, familyByItem);
  const goods = priceComposedBuild({
    msrpByFamily: composed.sellable.msrpByFamily,
    defaultCover: composed.sellable.defaultCover,
    defaultCase: composed.sellable.defaultCase,
    caseOptions: composed.sellable.caseOptions,
    chosenCover,
    chosenCase,
    addonLines: [
      ...input.addonLines.map((l) => ({
        msrp: msrpByItem.get(l.item_id) ?? null,
        quantity: l.quantity,
      })),
      ...placedChargeLines(placedPack, itemById, msrpByItem),
    ],
  });
  if (!goods.ok) {
    console.error(`[results/hold] pricing not usable (${goods.code}): ${goods.error}`);
    return NextResponse.json(
      { error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" },
      { status: 409 },
    );
  }

  const typedCode = await resolveCheckoutCode(input.code);

  const assistPartner = input.partnerAssistCode
    ? await getPartnerByReferralCode(input.partnerAssistCode)
    : null;
  const typedPartner =
    typedCode?.kind === "referral"
      ? typedCode.partner
      : !input.code?.trim() && input.referralCode
        ? await getPartnerByReferralCode(input.referralCode)
        : null;
  let linkPartner: Awaited<ReturnType<typeof getPartnerByReferralCode>> = null;
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
      linkPartner = await getPartnerByReferralCode(visitor.ref_code as string);
    }
  }
  const sessionPartnerId =
    assistPartner || typedPartner || linkPartner ? (await getPartnerContext())?.partnerId : null;
  const notSelf = async (partnerId: string | null | undefined) =>
    partnerId && !(await isSelfReferral(partnerId, { sessionPartnerId, email: input.email })) ? partnerId : null;
  const attribution = resolveAttribution({
    assistPartnerId: await notSelf(assistPartner?.id),
    typedPartnerId: await notSelf(typedPartner?.id),
    linkPartnerId: await notSelf(linkPartner?.id),
  });
  const attributedPartner =
    attribution.source === "assist"
      ? assistPartner
      : attribution.source === "typed"
        ? typedPartner
        : attribution.source === "link"
          ? linkPartner
          : null;
  const attributedRefCode = attributedPartner?.referral_code ?? null;

  let coupon: { id: string | null; code: string; terms: ResultCouponTerms } | null = null;
  if (typedCode?.kind === "coupon") {
    const check = await checkCoupon(typedCode.coupon, goods.subtotal, undefined, undefined, {
      customerEmail: input.email,
      account: await couponAccount(typedCode.coupon),
      lineItems: await resultCouponLineItems(admin, composedKey, goods.subtotal, typedCode.coupon.applies_to),
      excludeResultIds: [input.responseId, paired?.responseId].filter((id): id is string => Boolean(id)),
    });
    if (!check.valid) {
      return NextResponse.json(
        { error: check.error ?? "This code can't be used on this order", field: "code" },
        { status: 400 },
      );
    }
    coupon = {
      id: typedCode.coupon.id,
      code: typedCode.coupon.code,
      terms: couponTermsOf(typedCode.coupon),
    };
  }
  const today = sgtDate(new Date());
  const partnerCommission = attributedPartner ? commissionInEffect(attributedPartner.terms, today) : null;
  if (!coupon && attribution.source === "typed" && typedPartner?.referral_code) {
    const off = referralDiscountFor(typedPartner.terms, composedKey, today);
    if (off > 0) {
      coupon = {
        id: null,
        code: typedPartner.referral_code,
        terms: { discount_type: "fixed_amount", discount_value: off, max_discount: null },
      };
    }
  }
  const couponPricing = resultCouponPricing(coupon?.terms ?? null, goods.subtotal);

  let measuredBy: { type: "by_user" | "staff"; staffId: string | null };
  if (assisted) {
    measuredBy =
      assisted.measured_by_type === "staff"
        ? { type: "staff", staffId: assisted.measured_by_staff_id ?? null }
        : { type: "by_user", staffId: null };
  } else {
    const staff = await getAdminContext();
    const measuring = staff ? await actingProfile(staff.memberId) : null;
    measuredBy = measuring ? { type: "staff", staffId: measuring.id } : { type: "by_user", staffId: null };
  }

  let serviceLines;
  try {
    serviceLines = await loadResultServiceLines(admin, {
      measured_by_type: measuredBy.type,
      product_type: productType,
      suggested_tier: productType === "pillow" ? input.suggestedTier! : null,
    });
  } catch (e) {
    console.error(`[results/hold] service fees not usable: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json(
      { error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" },
      { status: 409 },
    );
  }
  const services = sumServiceLines(serviceLines);

  const shippingMethod = shippingRow as ShippingMethod | null;
  const shippingAmount =
    shippingMethod && !couponPricing.freeShipping
      ? resultShippingAmount(shippingMethod, shippingRate, goods.subtotal)
      : 0;
  const taxRule = await resolveTaxRuleForRegion(shippingCountry);
  const tax = computeTax(
    { subtotal: goods.subtotal + services, shippingAmount, discountAmount: couponPricing.discount },
    taxRule,
  );

  const priced = priceResult({
    goods: goods.subtotal,
    services,
    shipping: shippingAmount,
    tax: tax.taxAmount,
    discount: couponPricing.discount,
  });
  priced.total = round2(priced.total);

  const companion = paired
    ? await priceCompanionBolster(admin, {
        length: paired.suggestedLength,
        preferenceLines: paired.preferenceLines,
        addonLines: paired.addonLines,
        measuredByType: measuredBy.type,
        country: shippingCountry,
      })
    : null;
  if (companion && !companion.ok) {
    return companion.pricingUnavailable
      ? NextResponse.json({ error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" }, { status: 409 })
      : NextResponse.json({ error: companion.error }, { status: companion.status });
  }
  if (companion && companion.currency !== composed.sellable.currency) {
    return NextResponse.json({ error: PRICING_UNAVAILABLE_MESSAGE, code: "pricing_unavailable" }, { status: 409 });
  }
  const holdTotal = companion ? round2(priced.total + companion.total) : priced.total;

  const { authHoldEnabled } = parseSlaSettings(
    await getSiteSettings([...SLA_SETTING_KEYS]),
  );
  const takeCard = !input.deferred && authHoldEnabled;

  const currency = composed.sellable.currency;
  const accessToken =
    input.token && secretMatches(assisted?.access_token ?? undefined, input.token) ? input.token : randomUUID();
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

  const is_pre_order = preOrderFlagForResult(
    await loadPreOrderTriggerAtHold(admin, {
      productType,
      preferenceItemIds: preferenceLines.map((l) => l.item_id),
      suggestedSize: input.suggestedSize,
      suggestedTier: input.suggestedTier,
      suggestedLength: input.suggestedLength,
    }),
  );

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

  const row = {
    id: resultId,
    data: input.measurements ?? {},
    is_final: true,
    ...(assisted
      ? {}
      : { measured_by_type: measuredBy.type, measured_by_staff_id: measuredBy.staffId }),
    product_type: productType,
    suggested_size: productType === "pillow" ? input.suggestedSize! : null,
    suggested_tier: productType === "pillow" ? input.suggestedTier! : null,
    suggested_length: productType === "bolster" ? input.suggestedLength! : null,
    preference_lines: preferenceLines,
    addon_lines: addonLines,
    shipping_method: shippingMethod?.slug ?? null,
    shipping_address: shippingAddress?.ok ? shippingAddress.address : null,
    shipping_rate: shippingRate,
    authorized_amount: takeCard ? priced.total : null,
    currency,
    payment_intent_id: null as string | null,
    status: "held",
    customer_email: input.email,
    customer_phone: phoneNormalized,
    discovery_source: input.discoverySource,
    discovery_source_other: discoverySourceOther,
    partner_id: attribution.partnerId,
    ref_code: attributedRefCode,
    attribution_source: attribution.source,
    partner_commission: partnerCommission,
    coupon_id: coupon?.id ?? null,
    coupon_code: coupon?.code ?? null,
    coupon_terms: coupon?.terms ?? null,
    customer_id: input.deferred ? null : customerId,
    access_token: accessToken,
    source: input.deferred ? "staff_assisted" : "online_purchase",
    is_pre_order,
    paired_build_id: paired ? resultId : null,
    ...(recommendation_record ? { recommendation_record } : {}),
    ...(fillingSnapshot
      ? {
          filling_fingerprint: fillingSnapshot.fingerprint,
          filling_template_id: fillingSnapshot.fillingTemplateId,
        }
      : {}),
  };

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
  const companionDescription = paired ? `Mbolster ${paired.suggestedLength} hold` : null;

  let checkout: { sessionId: string; url: string } | null = null;
  if (takeCard) {
    try {
      const hold = {
        amount: holdTotal,
        currency,
        customerEmail: input.email,
        resultId,
        successUrl: `${origin}/results/${resultId}?token=${accessToken}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${cancelPath}?hold_cancelled=1`,
        description,
        metadata: {
          result_id: resultId,
          ...(paired && companion?.ok
            ? { paired_result_id: paired.responseId, paired_result_amount: String(companion.total) }
            : {}),
        },
        ...(companion?.ok
          ? {
              lines: [
                { name: description, amount: priced.total },
                { name: companionDescription!, amount: companion.total },
              ],
            }
          : {}),
      };
      const paramsHash = createHash("sha256").update(JSON.stringify(hold)).digest("hex");
      checkout = await createHoldCheckout({
        ...hold,
        idempotencyKey: `result_hold_${resultId}_${paramsHash}`,
      });
    } catch (e) {
      console.error("Hold checkout failed", e);
      return NextResponse.json(
        { error: errorTextWithoutStripeRequestId(e, "Failed to create authorization hold") },
        { status: 500 },
      );
    }
  }

  let write;
  if (assisted) {
    let update = admin.from("mp_config_responses").update(row).eq("id", resultId);
    update = assisted.status == null ? update.is("status", null) : update.eq("status", assisted.status);
    update =
      assisted.payment_intent_id == null
        ? update.is("payment_intent_id", null)
        : update.eq("payment_intent_id", assisted.payment_intent_id);
    write = await update.select("id");
  } else {
    write = await admin.from("mp_config_responses").insert(row).select("id");
  }
  if (write.error) {
    return NextResponse.json({ error: write.error.message }, { status: 500 });
  }
  if (!write.data?.length) {
    return NextResponse.json(
      { error: "This Result changed while it was being submitted. Please refresh and try again." },
      { status: 409 },
    );
  }

  if (assisted?.paired_build_id === resultId) {
    const keep = paired?.responseId ?? resultId;
    const { error: dropErr } = await admin
      .from("mp_config_responses")
      .delete()
      .eq("paired_build_id", resultId)
      .neq("id", resultId)
      .neq("id", keep)
      .eq("status", "held")
      .is("payment_intent_id", null);
    if (dropErr) return NextResponse.json({ error: dropErr.message }, { status: 500 });
    const { error: unlinkErr } = await admin
      .from("mp_config_responses")
      .update({ paired_build_id: null, access_token: null })
      .eq("paired_build_id", resultId)
      .neq("id", resultId)
      .neq("id", keep)
      .in("status", ["declined", "cancelled", "expired"]);
    if (unlinkErr) return NextResponse.json({ error: unlinkErr.message }, { status: 500 });
  }

  if (paired && companion?.ok) {
    const companionRow = {
      ...row,
      id: paired.responseId,
      data: paired.measurements ?? {},
      measured_by_type: measuredBy.type,
      measured_by_staff_id: measuredBy.staffId,
      product_type: "bolster",
      suggested_size: null,
      suggested_tier: null,
      suggested_length: paired.suggestedLength,
      preference_lines: paired.preferenceLines.map((l) => ({
        item_id: l.item_id,
        quantity: l.quantity,
        category: l.category,
      })),
      addon_lines: paired.addonLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
      shipping_rate: null,
      coupon_id: null,
      coupon_code: null,
      coupon_terms: null,
      authorized_amount: takeCard ? companion.total : null,
      is_pre_order: preOrderFlagForResult(
        await loadPreOrderTriggerAtHold(admin, {
          productType: "bolster",
          preferenceItemIds: paired.preferenceLines.map((l) => l.item_id),
          suggestedLength: paired.suggestedLength,
        }),
      ),
      recommendation_record: paired.recommendationRecord ?? null,
      filling_fingerprint: companionSnapshot?.fingerprint ?? null,
      filling_template_id: companionSnapshot?.fillingTemplateId ?? null,
      paired_build_id: resultId,
    };
    const companionWrite = companionPrior
      ? await admin
          .from("mp_config_responses")
          .update(companionRow)
          .eq("id", paired.responseId)
          .eq("paired_build_id", resultId)
          .eq("status", "held")
          .is("payment_intent_id", null)
          .select("id")
      : await admin.from("mp_config_responses").insert(companionRow).select("id");
    if (companionWrite.error) {
      return NextResponse.json({ error: companionWrite.error.message }, { status: 500 });
    }
    if (!companionWrite.data?.length) {
      return NextResponse.json(
        { error: "This Result changed while it was being submitted. Please refresh and try again." },
        { status: 409 },
      );
    }
    const { error: snapDelErr } = await admin
      .from("result_bolster_filling_placements")
      .delete()
      .eq("result_id", paired.responseId);
    if (snapDelErr) return NextResponse.json({ error: snapDelErr.message }, { status: 500 });
    if (companionSnapshot) {
      const { error: snapInsErr } = await admin
        .from("result_bolster_filling_placements")
        .insert(companionSnapshot.rows.map((r) => ({ result_id: paired.responseId, ...r })));
      if (snapInsErr) return NextResponse.json({ error: snapInsErr.message }, { status: 500 });
    }
  }

  if (fillingSnapshot) {
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

  await customerForCustomisation(
    admin,
    {
      email: input.email,
      name: typeof input.measurements?.name === "string" ? input.measurements.name : null,
      phone: phoneNormalized,
    },
    input.marketingEmail === true,
  );

  if (!input.deferred) {
    await stitchShopperVisitor(admin, req, { email: input.email, customerId });
  }

  const platformLink = `${origin}/settings/results/${resultId}`;
  const telegramStatus: TelegramStatus = (await isOnlineResultNoticeOn())
    ? await sendTelegram(
        renderOnlineResultHeld({
          label: suggestLabel,
          email: input.email,
          serviceLines,
          currency,
          total: priced.total,
          cardTaken: takeCard,
          paired:
            paired && companion?.ok
              ? {
                  length: paired.suggestedLength,
                  total: companion.total,
                  platformUrl: `${origin}/settings/results/${paired.responseId}`,
                }
              : null,
          platformUrl: platformLink,
          discount: coupon
            ? { code: coupon.code, amount: priced.discount, freeShipping: couponPricing.freeShipping }
            : null,
        }),
      )
    : "skipped";

  const emailStatus = await sendHeldEmail({
    to: input.email,
    resultId,
    accessToken,
    origin,
    productType,
    label: paired ? `${suggestLabel} + Mbolster ${paired.suggestedLength}` : suggestLabel,
    amount: takeCard ? holdTotal : null,
    currency,
  });

  const statusPath = `/results/${resultId}?token=${accessToken}`;

  return NextResponse.json({
    ok: true,
    resultId,
    accessToken,
    authorizedAmount: takeCard ? holdTotal : null,
    ...(paired ? { pairedResultId: paired.responseId } : {}),
    currency,
    checkoutUrl: checkout?.url ?? null,
    statusUrl: `${origin}${statusPath}`,
    telegramStatus,
    emailStatus,
  });
}
