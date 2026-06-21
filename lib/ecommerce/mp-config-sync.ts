import { supabaseAdmin } from "@/lib/supabase/server";

interface OrderItemForSync {
  id: string;
  variant_id: string;
  quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

interface CustomizationConfigRow {
  pillow_product_id: number;
  product_type?: string | null;
  bolster_variant?: string | null;
  llm_metadata: Record<string, unknown> | null;
  summary: string | null;
  filling_lines: unknown;
  config_lines: unknown;
  cover_variant: string | null;
  case_variant: string | null;
  total_addon_price: number;
}

export type { CustomizationConfigRow as MpConfigCustomizationRow };

export function isBolsterConfig(config: CustomizationConfigRow): boolean {
  if (config.product_type === "bolster") return true;
  const source = String((config.llm_metadata ?? {}).source ?? "");
  return source.includes("mbolster");
}

const SIZE_TO_BOLSTER_VARIANT: Record<string, string> = {
  S: "short",
  M: "medium",
  L: "long",
};

const BOLSTER_VARIANT_TO_SIZE: Record<string, string> = {
  short: "S",
  medium: "M",
  long: "L",
};

export function resolveBolsterSizeAndVariant(config: CustomizationConfigRow): {
  recommendedSize: string;
  bolsterVariant: string;
} {
  const meta = config.llm_metadata ?? {};
  let bolsterVariant = String(config.bolster_variant ?? meta.bolster_variant ?? "");
  let recommendedSize = String(meta.recommended_size ?? "");

  if (!recommendedSize && bolsterVariant) {
    recommendedSize = BOLSTER_VARIANT_TO_SIZE[bolsterVariant] ?? "";
  }
  if (!bolsterVariant && recommendedSize) {
    bolsterVariant = SIZE_TO_BOLSTER_VARIANT[recommendedSize] ?? "";
  }
  if (!recommendedSize && meta.height_cm != null) {
    const heightCm = Number(meta.height_cm);
    if (!Number.isNaN(heightCm) && heightCm > 0) {
      const heightM = heightCm / 100;
      if (heightM < 1.5) recommendedSize = "S";
      else if (heightM <= 1.8) recommendedSize = "M";
      else recommendedSize = "L";
      if (!bolsterVariant) {
        bolsterVariant = SIZE_TO_BOLSTER_VARIANT[recommendedSize] ?? "";
      }
    }
  }

  return { recommendedSize, bolsterVariant };
}

export function buildBolsterMpConfigData(
  config: CustomizationConfigRow,
  customerName: string,
): Record<string, unknown> {
  const meta = config.llm_metadata ?? {};
  const { recommendedSize, bolsterVariant } = resolveBolsterSizeAndVariant(config);
  const heightCm = meta.height_cm;

  return {
    name: customerName,
    gender: "",
    ageGroup: "",
    bloodPressureLevel: "",
    earDiscomfortSideSleep: "",
    bedFirmness: "",
    acidReflux: "",
    shoulderLength: "",
    neckToBack: "",
    headToBack: "",
    neckLength: "",
    height: heightCm != null ? String(heightCm) : "",
    sleep_position: String(meta.sleep_position ?? ""),
    online_recommended_size: recommendedSize,
    bolster_variant: bolsterVariant,
    cover_variant: config.cover_variant ?? "",
    case_variant: config.case_variant ?? "",
    component_summary: config.summary ?? "",
  };
}

function buildPillowMpConfigData(
  config: CustomizationConfigRow,
  customerName: string,
  product: { size: string; kind: string } | null,
): Record<string, unknown> {
  const meta = config.llm_metadata ?? {};
  const firmness = String(meta.firmness ?? "");
  let bedFirmness = "";
  if (firmness === "soft" || firmness === "medium-soft") bedFirmness = "soft";
  else if (firmness === "medium") bedFirmness = "medium";
  else if (firmness === "medium-firm" || firmness === "firm") bedFirmness = "firm";

  return {
    name: customerName,
    gender: "",
    ageGroup: "",
    bloodPressureLevel: "",
    earDiscomfortSideSleep: "",
    bedFirmness,
    acidReflux: "",
    shoulderLength: "",
    neckToBack: "",
    headToBack: "",
    neckLength: "",
    sleep_position: String(meta.sleep_position ?? ""),
    body_type: String(meta.body_type ?? ""),
    firmness,
    notes: String(meta.notes ?? ""),
    online_recommended_size: product?.size ?? "",
    online_recommended_kind: product?.kind ?? "",
  };
}

/**
 * Auto-create mp_config_responses from customized order items.
 *
 * Called after a successful checkout (Stripe webhook).
 * For each order item with a customization_id, creates an mp_config_response
 * linked to the order, populated with the customer's customization preferences.
 *
 * Idempotent: skips if a response already exists for the order_id + order_item_id.
 */
export async function createMpConfigFromCustomization(
  orderId: string,
  orderItems: OrderItemForSync[],
  shippingAddress?: { recipient?: string } | null,
): Promise<void> {
  const admin = supabaseAdmin();

  const customizedItems = orderItems.filter((item) => item.customization_id);
  if (customizedItems.length === 0) return;

  // Check for existing responses for this order (idempotency)
  const { data: existing } = await admin
    .from("mp_config_responses")
    .select("order_item_id")
    .eq("order_id", orderId);

  const existingItemIds = new Set((existing ?? []).map((r) => r.order_item_id));

  for (const item of customizedItems) {
    if (existingItemIds.has(item.id)) continue;

    // Fetch customization config
    const { data: config } = await admin
      .from("customization_configs")
      .select("pillow_product_id, product_type, bolster_variant, llm_metadata, summary, filling_lines, config_lines, cover_variant, case_variant, total_addon_price")
      .eq("id", item.customization_id!)
      .single();

    if (!config) continue;

    const customerName = shippingAddress?.recipient ?? "";
    const configRow = config as CustomizationConfigRow;

    if (isBolsterConfig(configRow)) {
      const data = buildBolsterMpConfigData(configRow, customerName);

      await admin.from("mp_config_responses").insert({
        id: crypto.randomUUID(),
        data,
        is_final: true,
        source: "online_bolster_customization",
        order_id: orderId,
        order_item_id: item.id,
      });
      continue;
    }

    // Fetch pillow product for size/kind
    const { data: product } = await admin
      .from("pillow_products")
      .select("size, kind")
      .eq("id", configRow.pillow_product_id)
      .single();

    const data = buildPillowMpConfigData(configRow, customerName, product);

    await admin.from("mp_config_responses").insert({
      id: crypto.randomUUID(),
      data,
      is_final: true,
      source: "online_customization",
      order_id: orderId,
      order_item_id: item.id,
    });
  }
}
