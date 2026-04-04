import { supabaseAdmin } from "@/lib/supabase/server";

interface OrderItemForSync {
  id: string;
  variant_id: string;
  quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
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
      .select("pillow_product_id, llm_metadata, summary, filling_lines, config_lines, cover_variant, case_variant, total_addon_price")
      .eq("id", item.customization_id!)
      .single();

    if (!config) continue;

    // Fetch pillow product for size/kind
    const { data: product } = await admin
      .from("pillow_products")
      .select("size, kind")
      .eq("id", config.pillow_product_id)
      .single();

    const meta = (config.llm_metadata ?? {}) as Record<string, unknown>;
    const customerName = shippingAddress?.recipient ?? "";

    // Map firmness to bedFirmness equivalent
    const firmness = String(meta.firmness ?? "");
    let bedFirmness = "";
    if (firmness === "soft" || firmness === "medium-soft") bedFirmness = "soft";
    else if (firmness === "medium") bedFirmness = "medium";
    else if (firmness === "medium-firm" || firmness === "firm") bedFirmness = "firm";

    // Build the data jsonb — measurement fields left empty for online customers,
    // customization preferences stored alongside
    const data = {
      // Standard measurement fields (empty for online)
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
      // Online customization preferences
      sleep_position: String(meta.sleep_position ?? ""),
      body_type: String(meta.body_type ?? ""),
      firmness,
      notes: String(meta.notes ?? ""),
      online_recommended_size: product?.size ?? "",
      online_recommended_kind: product?.kind ?? "",
    };

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
