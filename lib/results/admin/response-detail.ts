import {
  getDiscoverySourceCatalog,
  resolveDiscoverySourceLabel,
} from "@/lib/discovery-source";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { pickPartner } from "@/lib/results/paired-build";
import {
  inputsFromMpConfigData,
  recommendWithEngine,
  toPersistedRecommendationRecord,
} from "@/lib/rules-engine";
import { supabaseAdmin } from "@/lib/supabase/server";

type BomLineRow = {
  quantity: string | number;
  item: {
    id: number;
    category: string;
    name: string;
    size: string | null;
    subtype: string | null;
  } | null;
};

/** Fulfilment facts of the linked Order, shown on the Result detail page. */
export interface LinkedOrderDetail {
  id: string;
  order_number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  needs_attention: boolean | null;
  amount_refunded: number | null;
}

export interface MpConfigResponseDetailPayload {
  ok: true;
  response: Record<string, unknown> & {
    id: string;
    discovery_source_label: string | null;
    recommendation_record: unknown;
  };
  order_number: string | null;
  order: LinkedOrderDetail | null;
  suggestion: {
    recommended: { size: string; tier: string };
    product: { id: number; size: string; tier: "basic" | "premium" } | null;
    bom: BomLineRow[];
    reasons: string[];
    graph_version_id: unknown;
    recommendation_record: unknown;
  };
}

/**
 * What an Owner (not Staff) may see of their own Result.
 *
 * Built as an allowlist, never as a delete-the-sensitive-keys pass: a column
 * added to the query later must be excluded by default rather than included by
 * default. Traced against every guest reader — the configurator reads
 * `response.is_final` and `suggestion.recommended|product`, and /mp-maker reads
 * `response.data`. Nothing guest-side reads `suggestion.bom` (our bill of
 * materials) or `suggestion.reasons` (the rules-engine graph version and trace).
 */
export interface OwnerResultPayload {
  ok: true;
  response: {
    id: string;
    data: unknown;
    is_final: unknown;
  };
  suggestion: {
    recommended: { size: string; tier: string };
    product: { id: number; size: string; tier: "basic" | "premium" } | null;
  };
}

export function toOwnerResultPayload(
  full: MpConfigResponseDetailPayload,
): OwnerResultPayload {
  return {
    ok: true,
    response: {
      id: full.response.id,
      data: full.response.data,
      is_final: full.response.is_final,
    },
    suggestion: {
      recommended: full.suggestion.recommended,
      product: full.suggestion.product,
    },
  };
}

export type MpConfigResponseDetailResult =
  | { status: 200; body: MpConfigResponseDetailPayload }
  | { status: 404 | 500; body: { error: string } }
  | { status: 422; body: { error: string; missing: unknown } };

/**
 * Assembles the `/api/mp-config/responses/[id]` GET payload: the response row,
 * its linked order number and the rules-engine suggestion (product + BOM).
 * Shared by the route handler and the RSC result detail page.
 */
export async function loadMpConfigResponseDetail(
  id: string,
): Promise<MpConfigResponseDetailResult> {
  const admin = supabaseAdmin();
  const { data: responseRow, error: rErr } = await admin
    .from("mp_config_responses")
    .select(
      "id,data,is_final,measured_by_type,measured_by_staff_id,source,order_id,order_item_id,created_at,updated_at,status,product_type,suggested_size,suggested_tier,suggested_length,assigned_size,assigned_tier,assigned_length,filling_template_id,preference_lines,addon_lines,shipping_method,authorized_amount,final_amount,currency,payment_intent_id,topup_payment_intent_id,topup_paid_at,customer_id,customer_email,customer_phone,discovery_source,discovery_source_other,is_pre_order,recommendation_record,filling_fingerprint,paired_build_id,coupon_code",
    )
    .eq("id", id)
    .maybeSingle();

  if (rErr) return { status: 500, body: { error: rErr.message } };
  if (!responseRow) return { status: 404, body: { error: "Not found" } };

  const catalog = await getDiscoverySourceCatalog();
  const discovery_source_label = resolveDiscoverySourceLabel(
    catalog,
    responseRow.discovery_source,
    DEFAULT_LOCALE,
  );

  // The Result is terminal at capture, so the fulfilment half of the story lives on
  // the Order. Carry it through so the detail page can show the stage without
  // sending staff to a second surface.
  let orderNumber: string | null = null;
  let order: LinkedOrderDetail | null = null;
  if (responseRow.order_id) {
    const { data: orderRow } = await admin
      .from("orders")
      .select(
        "id, order_number, status, total, currency, paid_at, shipped_at, delivered_at, tracking_number, tracking_url, needs_attention, amount_refunded",
      )
      .eq("id", responseRow.order_id)
      .maybeSingle();
    orderNumber = orderRow?.order_number ?? null;
    order = orderRow
      ? {
          id: orderRow.id,
          order_number: orderRow.order_number ?? null,
          status: orderRow.status ?? null,
          total: orderRow.total != null ? Number(orderRow.total) : null,
          currency: orderRow.currency ?? null,
          paid_at: orderRow.paid_at ?? null,
          shipped_at: orderRow.shipped_at ?? null,
          delivered_at: orderRow.delivered_at ?? null,
          tracking_number: orderRow.tracking_number ?? null,
          tracking_url: orderRow.tracking_url ?? null,
          needs_attention: orderRow.needs_attention ?? null,
          amount_refunded:
            orderRow.amount_refunded != null ? Number(orderRow.amount_refunded) : null,
        }
      : null;
  }

  const data = (responseRow.data ?? {}) as Record<string, unknown>;
  const engineResult = await recommendWithEngine("premium-mpillow", inputsFromMpConfigData(data));

  if ("error" in engineResult) {
    return {
      status: 422,
      body: { error: engineResult.error, missing: engineResult.missing },
    };
  }

  const size = String(engineResult.size ?? "M");
  const tier = engineResult.soldTier ?? "premium";
  const reasons: string[] = [
    `Rules Engine ${engineResult.usedLegacyBootstrap ? "(legacy bootstrap)" : `graph ${engineResult.graphVersionId}`}`,
    `Shoulder → size ${size}`,
    `Premium flow → tier ${tier}`,
  ];
  if (engineResult.tierSuggestion && engineResult.tierSuggestion !== tier) {
    reasons.push(`Advisory tier suggestion: ${engineResult.tierSuggestion}`);
  }

  // Persist recommendation record on the response (preview / suggestion).
  if (!responseRow.recommendation_record) {
    await admin
      .from("mp_config_responses")
      .update({ recommendation_record: toPersistedRecommendationRecord(engineResult) })
      .eq("id", id);
  }

  const tryFindProduct = async (productTier: "basic" | "premium") => {
    return await admin
      .from("pillow_products")
      .select("id,size,kind,is_active")
      .eq("size", size)
      .eq("kind", productTier)
      .eq("is_active", true)
      .maybeSingle();
  };

  const { data: productPreferred, error: pErr1 } = await tryFindProduct(tier);
  if (pErr1) return { status: 500, body: { error: pErr1.message } };

  let product = productPreferred as { id: number; size: string; kind: "basic" | "premium" } | null;
  if (!product && tier === "premium") {
    const { data: fallback, error: pErr2 } = await tryFindProduct("basic");
    if (pErr2) return { status: 500, body: { error: pErr2.message } };
    if (fallback) {
      product = fallback as { id: number; size: string; kind: "basic" | "premium" };
      reasons.push("Preferred premium product not available; fell back to basic for this size");
    }
  }

  let bomLines: BomLineRow[] = [];
  if (product?.id) {
    const { data: lines, error: bErr } = await admin
      .from("bom_lines")
      .select("quantity,item:items(id,category,name,size,subtype)")
      .eq("product_id", product.id);
    if (bErr) return { status: 500, body: { error: bErr.message } };
    bomLines = (lines ?? []) as unknown as BomLineRow[];
  }

  // A Paired build (ADR 0026): the other Result on the same hold, so Staff can
  // move between the Mpillow and the Mbolster it carries.
  let paired_result_id: string | null = null;
  if (responseRow.paired_build_id === responseRow.id) {
    const { data: companions } = await admin
      .from("mp_config_responses")
      .select("id, status")
      .eq("paired_build_id", responseRow.id)
      .neq("id", responseRow.id);
    paired_result_id = pickPartner(companions ?? [], responseRow.id)?.id ?? null;
  } else if (responseRow.paired_build_id) {
    paired_result_id = responseRow.paired_build_id;
  }

  return {
    status: 200,
    body: {
      ok: true,
      response: {
        ...responseRow,
        paired_result_id,
        discovery_source_label,
        recommendation_record:
          responseRow.recommendation_record ?? toPersistedRecommendationRecord(engineResult),
      },
      order_number: orderNumber,
      order,
      suggestion: {
        recommended: {
          size,
          tier,
        },
        product: product
          ? { id: product.id, size: product.size, tier: product.kind }
          : null,
        bom: bomLines,
        reasons,
        graph_version_id: engineResult.graphVersionId,
        recommendation_record: toPersistedRecommendationRecord(engineResult),
      },
    },
  };
}
