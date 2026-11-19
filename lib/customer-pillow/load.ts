import type { SupabaseClient } from "@supabase/supabase-js";

import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import { loadTemplateKeys } from "@/lib/filling-templates/membership";
import { fittingLabel, type FittingAnswersView } from "@/lib/fitting-import/view";
import { loadPlacedItems, loadXrayOverrides } from "@/lib/results/admin/filling-mix";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import {
  boughtPillows,
  pillowOwnership,
  placementRows,
  type BoughtPillow,
  type PillowOrderItem,
  type PillowPurchaseLine,
} from "./bought";
import { fittingTypeCode, matchFittingTemplate, pillowSizeKey, type MatchableTemplate } from "./match";
import { ownBoughtPillows, pillowForOf } from "./pillow-for";
import type { CustomerPillowView } from "./view";

/**
 * The Customer's pillow for the Customer page (ADR 0042 j) and their Profile
 * (k), server-only. `customer_pillows`, the Filling Templates, the purchase
 * lines and the x-ray's overrides are the service role's, so the page reads
 * them here after checking `customers`, and the Profile by the Customer its
 * session is linked to.
 *
 * A Staff link wins. Without one, it is the latest pillow bought here, drawn
 * from the build its order line froze at Accept. Without that, the latest
 * Fitting record's that names a configuration type, matched to a template on
 * this read (`match.ts`). A link's or a fitting's template is drawn as it is
 * now, except a link a Re-adjustment wrote (ADR 0042 l): that is drawn from
 * the mix Staff left in the pillow, and names the template it came from.
 */

type LinkRow = {
  pillow_size: string;
  filling_template_id: number | string | null;
  /** A Re-adjustment's mix; null for a plain link. */
  filling_placements: unknown;
  linked_by_user_id: string | null;
  linked_by_profile_id: string | null;
  linked_at: string;
};

/** What the pillow reads of a Fitting record: the Customer page's records and the Profile's own both have it. */
export type PillowFittingAnswers = Pick<FittingAnswersView, "id" | "fittedAt" | "recommendedSize" | "configurationType" | "profileSide">;
type Fitting = PillowFittingAnswers;

/** The fitting the pillow is read from: the newest that names a type, else the newest. Fittings come newest first. */
export function pillowFitting<F extends Fitting>(fittings: readonly F[]): F | null {
  return fittings.find((f) => fittingTypeCode(f.configurationType) !== null) ?? fittings[0] ?? null;
}

/** Every active pillow Filling Template with the sizes it serves, by name. */
async function loadPillowTemplates(
  admin: SupabaseClient,
): Promise<{ ok: true; templates: MatchableTemplate[] } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bom_templates")
    .select("id, name, key")
    .eq("role", "filling")
    .eq("kind", "pillow")
    .eq("is_active", true)
    .order("name");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { id: number | string; name: string; key: string | null }[];
  const keys = await loadTemplateKeys(admin, rows.map((r) => Number(r.id)));
  if (!keys.ok) return keys;
  return {
    ok: true,
    templates: rows.map((r) => {
      const id = Number(r.id);
      // Membership is the authority; `key` is only its primary, for a row written before it.
      const members = keys.byId.get(id) ?? (r.key ? [r.key] : []);
      return { id, name: r.name, keys: PILLOW_TEMPLATE_KEYS.filter((k) => members.includes(k)) };
    }),
  };
}

/** Who linked it: the Staff profile they worked as, else the login's email. */
async function linkedByName(admin: SupabaseClient, link: LinkRow): Promise<string | null> {
  if (link.linked_by_profile_id) {
    const { data } = await admin.from("mp_staff").select("name").eq("id", link.linked_by_profile_id).maybeSingle();
    if (data?.name) return String(data.name);
  }
  if (link.linked_by_user_id) {
    const { data } = await admin.from("admin_users").select("email").eq("auth_user_id", link.linked_by_user_id).maybeSingle();
    if (data?.email) return String(data.email);
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The pillows bought here that they still have, latest first, and the order
 * numbers they were bought on. Counted Orders only, as `customer_purchase_lines`
 * counts them; units returned are not theirs.
 */
async function loadBoughtPillows(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ ok: true; bought: BoughtPillow[]; orderNumbers: Map<string, string> } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("customer_purchase_lines")
    .select("order_id, order_item_id, paid_at, size")
    .eq("customer_id", customerId)
    .eq("product_type", "pillow");
  if (error) return { ok: false, error: error.message };
  const lines = (data ?? []) as PillowPurchaseLine[];
  if (!lines.length) return { ok: true, bought: [], orderNumbers: new Map() };
  const [itemsRes, ordersRes] = await Promise.all([
    admin
      .from("order_items")
      .select("id, quantity, returned_quantity, customization_snapshot")
      .in("id", [...new Set(lines.map((l) => l.order_item_id))]),
    admin
      .from("orders")
      .select("id, order_number")
      .in("id", [...new Set(lines.map((l) => l.order_id))]),
  ]);
  if (itemsRes.error) return { ok: false, error: itemsRes.error.message };
  if (ordersRes.error) return { ok: false, error: ordersRes.error.message };
  const orderNumbers = new Map(
    ((ordersRes.data ?? []) as { id: string; order_number: string | null }[]).flatMap((o) =>
      o.order_number ? [[String(o.id), String(o.order_number)] as const] : [],
    ),
  );
  const all = boughtPillows(lines, (itemsRes.data ?? []) as PillowOrderItem[]);
  // A pillow they said was for someone else is that person's, not theirs.
  // uuid-shaped ids only: one malformed snapshot must not fail the whole read.
  const resultIds = [...new Set(all.flatMap((b) => (b.resultId && UUID.test(b.resultId) ? [b.resultId] : [])))];
  if (!resultIds.length) return { ok: true, bought: all, orderNumbers };
  const resultsRes = await admin.from("mp_config_responses").select("id, data").in("id", resultIds);
  if (resultsRes.error) return { ok: false, error: resultsRes.error.message };
  const forOthers = new Set(
    ((resultsRes.data ?? []) as { id: string; data: unknown }[])
      .filter((r) => pillowForOf(r.data) === "other")
      .map((r) => String(r.id)),
  );
  return { ok: true, bought: ownBoughtPillows(all, forOthers), orderNumbers };
}

export async function loadCustomerPillow(
  admin: SupabaseClient,
  customerId: string,
  fittings: readonly Fitting[],
): Promise<{ ok: true; pillow: CustomerPillowView } | { ok: false; error: string }> {
  const [linkRes, tpl, overrides, bought, migratedRes] = await Promise.all([
    admin
      .from("customer_pillows")
      .select("pillow_size, filling_template_id, filling_placements, linked_by_user_id, linked_by_profile_id, linked_at")
      .eq("customer_id", customerId)
      .maybeSingle<LinkRow>(),
    loadPillowTemplates(admin),
    loadXrayOverrides(admin),
    loadBoughtPillows(admin, customerId),
    admin.from("migrated_customers").select("shopify_orders_count").eq("customer_id", customerId).maybeSingle(),
  ]);
  if (linkRes.error) return { ok: false, error: linkRes.error.message };
  if (!tpl.ok) return tpl;
  if (!overrides.ok) return overrides;
  if (!bought.ok) return bought;
  if (migratedRes.error) return { ok: false, error: migratedRes.error.message };
  const link = linkRes.data;
  const readjusted = link !== null && link.filling_placements !== null && link.filling_placements !== undefined;

  const fitting = pillowFitting(fittings);
  const match = fitting ? matchFittingTemplate(fitting, tpl.templates) : null;
  // The latest pillow bought here whose build is on its line; an older line without one is still a purchase.
  const built = bought.bought.find((b) => b.placements.length > 0) ?? null;
  const ownership = pillowOwnership({
    boughtHere: bought.bought.length > 0,
    linked: link !== null,
    shopifyOrders: migratedRes.data ? Number(migratedRes.data.shopify_orders_count ?? 0) : null,
    fittings: fittings.length,
  });

  let source: CustomerPillowView["source"] = "none";
  let size: CustomerPillowView["size"] = null;
  let template: MatchableTemplate | null = null;
  let placements: PillowPlacementRow[] = [];
  if (link) {
    source = "linked";
    size = pillowSizeKey(link.pillow_size);
    const linkedId = link.filling_template_id === null ? null : Number(link.filling_template_id);
    template = linkedId === null ? null : (tpl.templates.find((t) => t.id === linkedId) ?? null);
    // A template made inactive since it was linked is still the one Staff chose: draw it by name.
    if (linkedId !== null && !template) {
      const { data } = await admin.from("bom_templates").select("id, name, key").eq("id", linkedId).maybeSingle();
      if (data) template = { id: Number(data.id), name: String(data.name), keys: data.key ? [String(data.key)] : [] };
    }
    // A Re-adjustment's pillow is what Staff left in it; the template only says where it came from.
    if (readjusted) placements = placementRows(link.filling_placements);
  } else if (built) {
    source = "order";
    size = built.size;
    placements = built.placements;
    // Named as it was built; the sizes it serves are the template's now, when it still exists.
    const now = built.templateId === null ? undefined : tpl.templates.find((t) => t.id === built.templateId);
    if (built.templateId !== null) {
      template = { id: built.templateId, name: built.templateName ?? now?.name ?? `Template #${built.templateId}`, keys: now?.keys ?? [] };
    }
  } else if (match && (match.template || match.size)) {
    source = "fitting";
    size = match.size;
    template = match.template;
  }

  if (template && source !== "order" && !readjusted) {
    const { data, error } = await admin
      .from("filling_template_placements")
      .select("section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm")
      .eq("template_id", template.id)
      .order("slot");
    if (error) return { ok: false, error: error.message };
    placements = (data ?? []) as unknown as PillowPlacementRow[];
  }
  const items = await loadPlacedItems(admin, placements);
  if (!items.ok) return items;

  return {
    ok: true,
    pillow: {
      source,
      size,
      template,
      link: link ? { linkedAt: link.linked_at, linkedBy: await linkedByName(admin, link), readjusted } : null,
      order: built
        ? {
            orderId: built.orderId,
            orderNumber: bought.orderNumbers.get(built.orderId) ?? null,
            paidAt: built.paidAt,
            size: built.size,
            templateName: built.templateName,
          }
        : null,
      fitting: fitting ? { id: fitting.id, fittedAt: fitting.fittedAt, label: fittingLabel(fitting) } : null,
      match,
      placements,
      items: items.items,
      colorOverrides: overrides.colorOverrides,
      dimensionOverrides: overrides.dimensionOverrides,
      templates: tpl.templates,
      ownership,
      onProfile: ownership !== null && source !== "none" && placements.length > 0,
    },
  };
}
