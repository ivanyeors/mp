import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomUUID } from "crypto";
import { secretMatches } from "@/lib/auth/secret";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { requireResultAccess } from "@/lib/results/access";
import { priceResult } from "@/lib/result-pricing";
import { round2 } from "@/lib/commissions";
import { placedChargeLines, priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { createHoldCheckout } from "@/lib/authorization-hold";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { getEmailTransport } from "@/lib/email";
import { sendTelegram } from "@/lib/telegram/notify";
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
import {
  AddonLineSchema,
  AddressSchema,
  PreferenceLineSchema,
} from "@/lib/results/finish-schemas";
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
import { getSiteSettings } from "@/lib/site-settings";
import { SLA_SETTING_KEYS, parseSlaSettings } from "@/lib/sla-reminders";
import {
  loadPreOrderTriggerAtHold,
  preOrderFlagForResult,
} from "@/lib/configurator/pre-order-persist";
import { getAdminContext } from "@/lib/auth/admin";
import { getPublicOrigin } from "@/lib/site-url";
import {
  derivePackList,
  MAX_LAYERS_PER_CELL,
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

/** Customer-facing message when a configuration's price isn't set up in Costings yet. */
const PRICING_UNAVAILABLE_MESSAGE =
  "This configuration isn’t available for purchase yet. Please contact us to complete your order.";

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
        insert_order: z.number().int().min(1).nullable().optional(),
      }),
    )
    .min(1),
  /** Client's still-matching template claim — re-verified server-side, never trusted alone. */
  templateId: z.number().int().positive().nullable().optional(),
});

const HoldSchema = z
  .object({
    responseId: z.string().uuid().optional(),
    /** Result access token — proves the caller owns an existing `responseId` row. */
    token: z.string().uuid().nullish(),
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
    /**
     * Submit with no card: an Assisted customisation. Honoured only when the
     * stored row is already `source = 'staff_assisted'` — see the guard in POST.
     */
    deferred: z.boolean().optional(),
    measurements: z.record(z.string(), z.unknown()).optional(),
    productType: z.enum(["pillow", "bolster"]).default("pillow"),
    suggestedSize: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
    /** Customer-facing tier (basic | premium). Maps to pillow_products.kind in DB. */
    suggestedTier: z.enum(["basic", "premium"]).optional(),
    /** Bolster length key (short | medium | long). */
    suggestedLength: z.enum(BOLSTER_LENGTHS).optional(),
    /** Cover/case and shipping: required, except on a deferred submit (see superRefine). */
    preferenceLines: z.array(PreferenceLineSchema).default([]),
    addonLines: z.array(AddonLineSchema).default([]),
    shippingMethodId: z.string().uuid().optional(),
    shippingAddress: AddressSchema.optional(),
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
    // Only an Assisted customisation may leave the finish for later: it is sent
    // from the questionnaire, and the customer picks cover, case and shipping
    // after Staff assign the fillings (ADR 0017). Everyone else finishes now.
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
  const origin = getPublicOrigin(req);
  const productType = input.productType;

  // Deferred (no-card) submit — the trust boundary of the assisted flow.
  //
  // A request cannot ASK to skip payment. The only thing that authorises it is
  // the row already on disk carrying `source = 'staff_assisted'`, which the
  // responses route wrote on create after re-resolving a real Assist link code.
  // Without this, any caller could post `deferred: true` and drop a free build
  // into the build queue. Checked before pricing, Stripe and every write, so a
  // refusal costs nothing and leaves nothing behind.
  const { data: assisted, error: assistedErr } = input.responseId
    ? await admin
        .from("mp_config_responses")
        .select("source, status, access_token, customer_id, customer_email, order_id, payment_intent_id")
        .eq("id", input.responseId)
        .maybeSingle()
    : { data: null, error: null };
  if (assistedErr) {
    return NextResponse.json({ error: assistedErr.message }, { status: 500 });
  }
  // Creating a Result stays open. Re-submitting one does not: the write below
  // rewrites its email and payment fields, so knowing the id alone would let a
  // stranger take the Result over and orphan the owner's Authorization hold.
  // Same gate as every other write to an existing Result (lib/results/access.ts),
  // with Staff narrowed to `results`: a viewer carries `orders` and must not
  // rewrite a customer's Result.
  if (assisted) {
    const access = await requireResultAccess(assisted, input.token ?? null, {
      staffPermissions: ["results"],
    });
    if (!access.ok) return access.response;
  }
  // Nothing Staff have assigned, or a customer has paid for, is resubmittable.
  // The write below would otherwise reset it to a fresh `held` row. A stale
  // configurator tab could do that with the same session id. A `held` row with
  // a payment intent is paid for too: re-submitting would null the intent and
  // orphan the card hold, and the same params replay an already-completed
  // Checkout whose webhook never fires again.
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

  const prefIds = input.preferenceLines.map((l) => l.item_id);
  const addonIds = input.addonLines.map((l) => l.item_id);
  // A neck support staff placed is charged, so its price is looked up with the rest.
  const placedPack = derivePackList(input.assistFilling?.placements ?? [], []);
  const allItemIds = [...new Set([...prefIds, ...addonIds, ...placedPack.map((l) => l.item_id)])];

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
    // Both pricing faults look identical to a shopper and must not leak the
    // reason, but they are very different to whoever reads the log: one means
    // nobody set a price, the other that two are set and the code cannot choose.
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

  // The quote the shopper is about to authorise. Same function as the final charge
  // at assign and as the preview total — they disagreed before, showing the shelf
  // price and charging shelf + cover + case.
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

  // No shipping yet on an Assisted submit sent from the questionnaire. The quote
  // is goods-only, the same as assign prices it until the customer finishes.
  const shippingMethod = shippingRow as ShippingMethod | null;
  const shippingAmount = shippingMethod ? calculateShippingRate(shippingMethod, goods.subtotal) : 0;
  const taxRule = await resolveTaxRuleForRegion(input.shippingAddress?.country ?? "SG");
  const tax = computeTax(
    { subtotal: goods.subtotal, shippingAmount, discountAmount: 0 },
    taxRule,
  );

  const priced = priceResult({
    subtotal: goods.subtotal,
    shipping: shippingAmount,
    tax: tax.taxAmount,
  });
  // Cents, once: the row's numeric(12,2) would round a float-dust total on store,
  // and the hold webhook compares that stored amount against what Checkout charged.
  priced.total = round2(priced.total);

  // Whether to take a card now. Two independent reasons not to:
  //   - `deferred` — an Assisted customisation, authorised by the stored row above.
  //   - the admin kill switch — holds turned off for ordinary online submits.
  // They differ in ONE respect and it matters: `deferred` also stamps
  // `source = 'staff_assisted'`, which the switch must NOT, or every online
  // submit made while holds are off would look like it came through an Assist
  // link. `resultStage` keys the queue off `authorized_amount` rather than
  // `source` precisely so both land in `needs_assign` instead of reading as an
  // abandoned checkout.
  const { authHoldEnabled } = parseSlaSettings(
    await getSiteSettings([...SLA_SETTING_KEYS]),
  );
  const takeCard = !input.deferred && authHoldEnabled;

  const currency = composed.sellable.currency;
  // Kept only when this request presented it: a fresh token would change the
  // Checkout success URL, so the Owner's honest retry would no longer match its
  // own idempotency key. Anyone else who passed the gate (Staff, a signed-in
  // Customer, a legacy Draft) gets a new one — otherwise Staff re-submitting on a
  // shared device would email the next customer the previous customer's token.
  // Same plain comparison as authorizeResultAccess: a random per-row uuid.
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
    // Null on an Assisted submit from the questionnaire — needsCustomerFinish()
    // reads exactly that until the customer picks their finish.
    shipping_method: shippingMethod?.slug ?? null,
    shipping_address: input.shippingAddress ?? null,
    // No card was taken for an Assisted customisation, so there is no authorized
    // amount. The price is still computed above — an unpriced Composed sellable
    // must refuse here exactly as on the hold path, or Staff inherit a
    // submission they cannot quote.
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
    // How it attributed (assist>typed>link) — #80 reads this for PDPA masking.
    attribution_source: attribution.source,
    // An Assisted submit is usually made on a Staff member's signed-in device, so
    // the session user is not the buyer. Link nothing. The customer still finds
    // the Result by `customer_email` when they sign in.
    customer_id: input.deferred ? null : customerId,
    access_token: accessToken,
    source: input.deferred ? "staff_assisted" : "online_purchase",
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

  // An Assisted customisation takes no card, so there is no Checkout to create.
  // Everything else still runs: pricing, attribution, discovery source, the
  // Pre-order flag, the token and the filling snapshot are identical — this is
  // the same submit with the Stripe step removed (ADR 0016).
  //
  // Checkout is created BEFORE the row is written, so a Stripe failure leaves
  // nothing behind to clean up. The old order wrote first and deleted on failure,
  // which destroyed the Owner's existing Result on an ordinary retry. A session
  // whose write then fails is never handed out and expires unpaid.
  let checkout: { sessionId: string; url: string } | null = null;
  if (takeCard) {
    try {
      const hold = {
        amount: priced.total,
        currency,
        customerEmail: input.email,
        resultId,
        successUrl: `${origin}/results/${resultId}?token=${accessToken}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}${cancelPath}?hold_cancelled=1`,
        description,
        metadata: { result_id: resultId },
      };
      // Stripe rejects a reused key sent with different parameters, so the key
      // hashes exactly what is sent: an honest retry replays the same session, a
      // changed build gets a new one.
      const paramsHash = createHash("sha256").update(JSON.stringify(hold)).digest("hex");
      checkout = await createHoldCheckout({
        ...hold,
        idempotencyKey: `result_hold_${resultId}_${paramsHash}`,
      });
    } catch (e) {
      console.error("Hold checkout failed", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to create authorization hold" },
        { status: 500 },
      );
    }
  }

  // An existing row is written only if it is still what the checks above saw.
  // The Stripe call sits between them, and in that window Staff can assign the
  // Result or the webhook can attach a card; overwriting either would reset a
  // live Result to a fresh `held` one. A brand-new Result is a plain insert.
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

  const platformLink = `${origin}/settings/results/${resultId}`;
  const telegramStatus = await sendTelegram(
    [
      "💤 Held Result (online purchase) — review needed",
      suggestLabel,
      `Email: ${input.email}`,
      takeCard
        ? `Authorized: ${currency} ${priced.total.toFixed(2)}`
        : `No card taken — quoted ${currency} ${priced.total.toFixed(2)}`,
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
    // Null swaps the email to its no-card voice: no authorized-amount panel, and
    // a promise of the price by email once Staff finish the build.
    amount: takeCard ? priced.total : null,
    currency,
  });

  const statusPath = `/results/${resultId}?token=${accessToken}`;

  return NextResponse.json({
    ok: true,
    resultId,
    accessToken,
    authorizedAmount: takeCard ? priced.total : null,
    currency,
    // Deferred submits have no Checkout — the client goes straight to the status
    // page, which is where the customer waits for Staff to finish the build.
    checkoutUrl: checkout?.url ?? null,
    statusUrl: `${origin}${statusPath}`,
    telegramStatus,
    emailStatus,
  });
}
