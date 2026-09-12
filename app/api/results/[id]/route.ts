import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { priceResult } from "@/lib/result-pricing";
import { priceComposedBuild, resolvePreferences } from "@/lib/pricing/composed-price";
import { isBolsterLength, loadComposedSellable } from "@/lib/results/composed-sellable";
import { calculateShippingRate } from "@/lib/ecommerce/shipping";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { authorizeResultAccess } from "@/lib/results/access";
import { derivePackList } from "@/lib/spatial-fillings";
import { listConfigUploads } from "@/lib/config-upload";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS =
  "id, status, product_type, suggested_size, suggested_tier, suggested_length, assigned_size, assigned_tier, assigned_length, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, authorized_amount, final_amount, currency, created_at, updated_at, customer_email, payment_intent_id, is_pre_order";

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
      ? await admin.from("items").select("id, name, subtype").in("id", allIds)
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
        const { chosenCover, chosenCase } = resolvePreferences(
          preferenceLines,
          composed.sellable.caseOptions,
          msrpByItem,
        );
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
        if (goods.ok) {
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
              shippingAmount = calculateShippingRate(
                shippingRow as ShippingMethod,
                goods.subtotal,
              );
              const taxRule = await resolveTaxRuleForRegion(address?.country ?? "SG");
              taxAmount = computeTax(
                { subtotal: goods.subtotal, shippingAmount, discountAmount: 0 },
                taxRule,
              ).taxAmount;
            }
          }
          pricing = priceResult({
            subtotal: goods.subtotal,
            shipping: shippingAmount,
            tax: taxAmount,
          });
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
  const publicRow = { ...row };
  delete (publicRow as { access_token?: string }).access_token;
  delete (publicRow as { customer_id?: string }).customer_id;
  delete (publicRow as { shipping_address?: unknown }).shipping_address;
  const referenceImages = await listConfigUploads(id).catch(() => []); // ponytail: tolerate empty/error
  return NextResponse.json({ result: { ...publicRow, build, referenceImages } });
}
