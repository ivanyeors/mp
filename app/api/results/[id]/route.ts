import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { priceResult } from "@/lib/result-pricing";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { authorizeResultAccess } from "@/lib/results/access";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS =
  "id, status, product_type, suggested_size, suggested_tier, suggested_length, assigned_size, assigned_tier, assigned_length, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, authorized_amount, final_amount, currency, created_at, updated_at, customer_email, payment_intent_id";

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

async function buildPublicSummary(row: {
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
  authorized_amount: number | null;
  final_amount: number | null;
  currency: string | null;
  payment_intent_id: string | null;
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

  if (row.filling_template_id) {
    const { data: template } = await admin
      .from("bom_templates")
      .select("id, name")
      .eq("id", row.filling_template_id)
      .maybeSingle();
    fillingTemplateName = template?.name ?? null;

    const { data: tplLines } = await admin
      .from("bom_template_lines")
      .select("item_id, quantity")
      .eq("template_id", row.filling_template_id);
    for (const l of tplLines ?? []) fillIds.push(l.item_id as number);

    const allIds = [
      ...new Set([
        ...fillIds,
        ...preferenceLines.map((l) => l.item_id),
        ...addonLines.map((l) => l.item_id),
      ]),
    ];
    const { data: items } = allIds.length
      ? await admin.from("items").select("id, name, subtype").in("id", allIds)
      : { data: [] as Array<{ id: number; name: string; subtype: string | null }> };
    const nameByItem = new Map(
      (items ?? []).map((i) => [i.id as number, itemLabel(i.name, i.subtype)]),
    );

    fillingSummary = (tplLines ?? []).map(
      (l) =>
        `${nameByItem.get(l.item_id as number) ?? `Item #${l.item_id}`} ×${Number(l.quantity)}`,
    );

    const preferences = preferenceLines.map(
      (l) => `${l.category}: ${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`}`,
    );
    const addons = addonLines.map(
      (l) => `${nameByItem.get(l.item_id) ?? `Item #${l.item_id}`} ×${l.quantity}`,
    );

    let pricing: {
      subtotal: number;
      shipping: number;
      tax: number;
      total: number;
    } | null = null;

    if (row.final_amount != null || row.payment_intent_id != null) {
      const productType = row.product_type ?? "pillow";
      if (productType === "pillow" && row.assigned_size && row.assigned_tier) {
        const { data: pillowProduct } = await admin
          .from("pillow_products")
          .select("id")
          .eq("size", row.assigned_size)
          .eq("kind", row.assigned_tier)
          .eq("is_active", true)
          .maybeSingle();
        if (pillowProduct) {
          const { data: productPrice } = await admin
            .from("product_prices")
            .select("msrp")
            .eq("kind", "pillow")
            .eq("product_id", pillowProduct.id)
            .maybeSingle();
          const composedMsrp =
            productPrice?.msrp != null ? Number(productPrice.msrp) : null;
          if (composedMsrp != null) {
            const prefAddonIds = [
              ...preferenceLines.map((l) => l.item_id),
              ...addonLines.map((l) => l.item_id),
            ];
            const { data: prices } = prefAddonIds.length
              ? await admin
                  .from("item_prices")
                  .select("item_id, msrp")
                  .in("item_id", prefAddonIds)
              : { data: [] as Array<{ item_id: number; msrp: number | null }> };
            const msrpByItem = new Map(
              (prices ?? [])
                .filter((p) => p.msrp != null)
                .map((p) => [p.item_id as number, Number(p.msrp)]),
            );
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
            pricing = priceResult({
              composedSellableMsrp: composedMsrp,
              preferenceLines: preferencePriced,
              addonLines: addonPriced,
              shipping: shippingAmount,
              tax: taxAmount,
            });
          }
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
    .select(`${PUBLIC_FIELDS}, access_token, customer_id`)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sync payment_intent_id from Checkout session when returning from Stripe.
  if (sessionId && !row.payment_intent_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const metaId = session.metadata?.result_id;
      if (metaId === id) {
        const pi =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        if (pi) {
          await admin
            .from("mp_config_responses")
            .update({ payment_intent_id: pi })
            .eq("id", id);
          row.payment_intent_id = pi;
        }
      }
    } catch (e) {
      console.error("Failed to sync payment intent from session", e);
    }
  }

  const build = await buildPublicSummary(row);
  const { access_token: _t, customer_id: _c, shipping_address: _a, ...publicRow } = row;
  return NextResponse.json({ result: { ...publicRow, build } });
}
