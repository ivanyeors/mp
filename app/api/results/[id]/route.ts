import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { attachHoldPaymentIntent } from "@/lib/authorization-hold";
import { priceResult } from "@/lib/result-pricing";
import { priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { loadResultServiceLines, quotedServiceLines, sumServiceLines } from "@/lib/pricing/service-lines";
import { isBolsterLength, loadComposedSellable } from "@/lib/results/composed-sellable";
import { pickPartner, shipsWithAnchor } from "@/lib/results/paired-build";
import { resultShippingAmount } from "@/lib/results/shipping";
import { discountRowOf, resultCouponPricing } from "@/lib/results/discount";
import { collectLocationOf } from "@/lib/shipping/self-collect";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { authorizeResultAccess } from "@/lib/results/access";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import { derivePackList } from "@/lib/spatial-fillings";
import { listConfigUploads } from "@/lib/config-upload";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS =
  "id, status, product_type, suggested_size, suggested_tier, suggested_length, assigned_size, assigned_tier, assigned_length, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, shipping_rate, authorized_amount, final_amount, currency, created_at, updated_at, customer_email, payment_intent_id, is_pre_order, paired_build_id";

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

async function buildPublicSummary(row: {
  id: string;
  status: string | null;
  product_type: string | null;
  assigned_size: string | null;
  assigned_tier: string | null;
  assigned_length: string | null;
  filling_template_id: number | null;
  preference_lines: unknown;
  addon_lines: unknown;
  shipping_method: string | null;
  shipping_address: unknown;
  shipping_rate?: number | string | null;
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  payment_intent_id: string | null;
  measured_by_type?: string | null;
  paired_build_id?: string | null;
  coupon_code?: string | null;
  coupon_terms?: unknown;
}) {
  if (row.status !== "assigned" && row.status !== "accepted" && row.status !== "captured") {
    return null;
  }

  const admin = supabaseAdmin();
  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];
  const fillIds: number[] = [];

  let fillingTemplateName: string | null = null;
  let fillingSummary: string[] = [];

  // Revised builds: the Result's spatial snapshot is the filling truth when present
  // (template id may be null after a diverging edit); template lines are the fallback.
  const { data: snapRows } = await admin
    .from("result_filling_placements")
    .select("item_id")
    .eq("result_id", row.id);
  let fillLines: Array<{ item_id: number; quantity: number }> = derivePackList(
    (snapRows ?? []) as Array<{ item_id: number }>,
    [],
  ).map((l) => ({ item_id: l.item_id, quantity: l.count }));

  if (row.filling_template_id || fillLines.length > 0) {
    if (row.filling_template_id) {
      const { data: template } = await admin
        .from("bom_templates")
        .select("id, name")
        .eq("id", row.filling_template_id)
        .maybeSingle();
      fillingTemplateName = template?.name ?? null;

      if (fillLines.length === 0) {
        const { data: tplLines } = await admin
          .from("bom_template_lines")
          .select("item_id, quantity")
          .eq("template_id", row.filling_template_id);
        fillLines = (tplLines ?? []).map((l) => ({
          item_id: l.item_id as number,
          quantity: Number(l.quantity),
        }));
      }
    }
    for (const l of fillLines) fillIds.push(l.item_id);

    const allIds = [
      ...new Set([
        ...fillIds,
        ...preferenceLines.map((l) => l.item_id),
        ...addonLines.map((l) => l.item_id),
      ]),
    ];
    const { data: items } = allIds.length
      ? await admin.from("items").select("id, name, subtype, category, price_family").in("id", allIds)
      : { data: [] as Array<{ id: number; name: string; subtype: string | null }> };
    const nameByItem = new Map(
      (items ?? []).map((i) => [i.id as number, itemLabel(i.name, i.subtype)]),
    );

    fillingSummary = fillLines.map(
      (l) => `${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`} ×${l.quantity}`,
    );

    const preferences = preferenceLines.map(
      (l) => `${l.category}: ${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`}`,
    );
    const addons = addonLines.map(
      (l) => `${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`} ×${l.quantity}`,
    );

    let pricing: {
      subtotal: number;
      /** Service fees inside the subtotal (ADR 0024), one row each. */
      services: Array<{ label: string; amount: number }>;
      /** The discount code kept at hold, off the goods (ADR 0033). */
      discount?: { code: string; amount: number };
      shipping: number;
      tax: number;
      total: number;
    } | null = null;

    if (row.final_amount != null || row.payment_intent_id != null) {
      const productType = row.product_type ?? "pillow";
      const composedKey =
        productType === "bolster"
          ? row.assigned_length && isBolsterLength(row.assigned_length)
            ? ({ productType: "bolster", length: row.assigned_length } as const)
            : null
          : row.assigned_size && row.assigned_tier
            ? ({
                productType: "pillow",
                size: row.assigned_size,
                tier: row.assigned_tier,
              } as const)
            : null;

      // This was a fifth hand-rolled copy of the pricing rule, reading
      // `product_prices` with maybeSingle() — the very call that errors on premium's
      // two rows. It left the shopper's own status page with no breakdown at all,
      // and it skipped bolster entirely. Both now go through the shared loader.
      const composed = composedKey ? await loadComposedSellable(admin, composedKey) : null;
      if (composed?.ok) {
        const prefAddonIds = [
          ...preferenceLines.map((l) => l.item_id),
          ...addonLines.map((l) => l.item_id),
        ];
        const { data: prices } = prefAddonIds.length
          ? await admin.from("item_prices").select("item_id, msrp").in("item_id", prefAddonIds)
          : { data: [] as Array<{ item_id: number; msrp: number | null }> };
        const msrpByItem = new Map(
          (prices ?? [])
            .filter((p) => p.msrp != null)
            .map((p) => [p.item_id as number, Number(p.msrp)]),
        );
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
          // Add-ons only: a placed neck support is in the pillow's MSRP, like the fillings.
          addonLines: addonLines.map((l) => ({
            msrp: msrpByItem.get(l.item_id) ?? null,
            quantity: l.quantity,
          })),
        });
        const serviceLines = goods.ok
          ? await loadResultServiceLines(admin, {
              measured_by_type: row.measured_by_type ?? null,
              product_type: productType,
              assigned_tier: row.assigned_tier,
            }).catch((e) => {
              console.error("[results/status] service fees not usable", e);
              return null;
            })
          : null;
        if (goods.ok && serviceLines) {
          const services = sumServiceLines(serviceLines);
          const coupon = resultCouponPricing(row.coupon_terms, goods.subtotal);
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
              // A Paired build's Mbolster rides in its Mpillow's shipment (ADR 0026).
              shippingAmount =
                shipsWithAnchor(row) || coupon.freeShipping
                  ? 0
                  : resultShippingAmount(shippingRow as ShippingMethod, row.shipping_rate, goods.subtotal);
              const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
              taxAmount = computeTax(
                { subtotal: goods.subtotal + services, shippingAmount, discountAmount: coupon.discount },
                taxRule,
              ).taxAmount;
            }
          }
          const repriced = priceResult({
            goods: goods.subtotal,
            services,
            shipping: shippingAmount,
            tax: taxAmount,
            discount: coupon.discount,
          });
          // A total stored before Service fees existed did not quote one; show
          // the build the customer is actually paying for (ADR 0024).
          const quoted = quotedServiceLines(
            row.final_amount != null ? Number(row.final_amount) : null,
            repriced,
            serviceLines,
          );
          const priced =
            quoted.length === serviceLines.length
              ? repriced
              : priceResult({
                  goods: goods.subtotal,
                  services: sumServiceLines(quoted),
                  shipping: shippingAmount,
                  tax: taxAmount,
                  discount: coupon.discount,
                });
          pricing = {
            subtotal: priced.subtotal,
            services: quoted.map((l) => ({ label: l.label, amount: l.msrp })),
            discount: discountRowOf(row.coupon_code, row.coupon_terms, priced.discount),
            shipping: priced.shipping,
            tax: priced.tax,
            total: priced.total,
          };
        }
      }
    }

    return {
      fillingTemplateName,
      fillingSummary,
      preferences,
      addons,
      pricing,
    };
  }

  return {
    fillingTemplateName: null,
    fillingSummary: [],
    preferences: preferenceLines.map((l) => `${l.category}: item #${l.item_id}`),
    addons: addonLines.map((l) => `item #${l.item_id} ×${l.quantity}`),
    pricing: null,
  };
}

/**
 * Public Result status for the customer status page.
 * Auth: access_token query param (guest magic link) or logged-in customer email/id match.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("session_id");

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("mp_config_responses")
    .select(`${PUBLIC_FIELDS}, access_token, customer_id, source, measured_by_type, coupon_code, coupon_terms`)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sync payment_intent_id from Checkout session when returning from Stripe, so
  // the page shows the hold before the webhook lands. Same writer as the webhook;
  // a refused session writes nothing here and the webhook records it.
  if (sessionId && !row.payment_intent_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.result_id === id) {
        const attached = await attachHoldPaymentIntent(admin, session);
        if (attached.ok) row.payment_intent_id = attached.paymentIntentId;
      }
    } catch (e) {
      console.error("Failed to sync payment intent from session", e);
    }
  }

  const build = await buildPublicSummary(row);
  // A Paired build (ADR 0026) is decided on one page: the anchor's shows its
  // Mbolster, and the Mbolster's points back at it. Same access token on both.
  let paired: {
    role: "anchor" | "companion";
    partner: Record<string, unknown> & { build: Awaited<ReturnType<typeof buildPublicSummary>> };
  } | null = null;
  if (row.paired_build_id) {
    const anchorSide = row.paired_build_id === row.id;
    let partnerQuery = admin
      .from("mp_config_responses")
      .select(`${PUBLIC_FIELDS}, measured_by_type, coupon_code, coupon_terms`);
    partnerQuery = anchorSide
      ? partnerQuery.eq("paired_build_id", row.id).neq("id", row.id)
      : partnerQuery.eq("id", row.paired_build_id);
    const { data: partners } = await partnerQuery;
    const partner = pickPartner(partners ?? [], row.id);
    if (partner) {
      const partnerPublic: Record<string, unknown> = { ...partner };
      delete partnerPublic.shipping_address;
      delete partnerPublic.measured_by_type;
      delete partnerPublic.coupon_terms;
      paired = {
        role: anchorSide ? "anchor" : "companion",
        partner: { ...partnerPublic, build: await buildPublicSummary(partner) },
      };
    }
  }
  // Read before the address is stripped: the page needs the answer, not the address.
  const needs_finish = needsCustomerFinish(row);
  /** Self-collect: the studio's name, never its address line (the customer's own). */
  const collect_at = collectLocationOf(row.shipping_address)?.name ?? null;
  const publicRow = { ...row };
  delete (publicRow as { access_token?: string }).access_token;
  delete (publicRow as { customer_id?: string }).customer_id;
  delete (publicRow as { shipping_address?: unknown }).shipping_address;
  delete (publicRow as { source?: string | null }).source;
  delete (publicRow as { measured_by_type?: string | null }).measured_by_type;
  // The page shows the discount from `build.pricing`, never the coupon's terms.
  delete (publicRow as { coupon_terms?: unknown }).coupon_terms;
  const referenceImages = await listConfigUploads(id).catch(() => []); // ponytail: tolerate empty/error
  return NextResponse.json({
    result: { ...publicRow, needs_finish, collect_at, build, referenceImages, paired },
  });
}
