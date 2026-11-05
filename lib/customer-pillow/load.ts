import type { SupabaseClient } from "@supabase/supabase-js";

import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import { loadTemplateKeys } from "@/lib/filling-templates/membership";
import { fittingLabel, type FittingAnswersView } from "@/lib/fitting-import/view";
import { loadPlacedItems, loadXrayOverrides } from "@/lib/results/admin/filling-mix";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { fittingTypeCode, matchFittingTemplate, pillowSizeKey, type MatchableTemplate } from "./match";
import type { CustomerPillowView } from "./view";

/**
 * The Customer's pillow for the Customer page (ADR 0042 j), server-only.
 * `customer_pillows`, the Filling Templates and the x-ray's overrides are the
 * service role's, so the page reads them here after checking `customers`.
 *
 * A Staff link wins. Without one, the pillow is the latest Fitting record's
 * that names a configuration type, matched to a template on this read
 * (`match.ts`). Either way the template is drawn as it is now.
 */

type LinkRow = {
  pillow_size: string;
  filling_template_id: number | string | null;
  linked_by_user_id: string | null;
  linked_by_profile_id: string | null;
  linked_at: string;
};

type Fitting = Pick<FittingAnswersView, "id" | "fittedAt" | "recommendedSize" | "configurationType" | "profileSide">;

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

export async function loadCustomerPillow(
  admin: SupabaseClient,
  customerId: string,
  fittings: readonly Fitting[],
): Promise<{ ok: true; pillow: CustomerPillowView } | { ok: false; error: string }> {
  const [linkRes, tpl, overrides] = await Promise.all([
    admin
      .from("customer_pillows")
      .select("pillow_size, filling_template_id, linked_by_user_id, linked_by_profile_id, linked_at")
      .eq("customer_id", customerId)
      .maybeSingle<LinkRow>(),
    loadPillowTemplates(admin),
    loadXrayOverrides(admin),
  ]);
  if (linkRes.error) return { ok: false, error: linkRes.error.message };
  if (!tpl.ok) return tpl;
  if (!overrides.ok) return overrides;
  const link = linkRes.data;

  const fitting = pillowFitting(fittings);
  const match = fitting ? matchFittingTemplate(fitting, tpl.templates) : null;

  let source: CustomerPillowView["source"] = "none";
  let size: CustomerPillowView["size"] = null;
  let template: MatchableTemplate | null = null;
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
  } else if (match && (match.template || match.size)) {
    source = "fitting";
    size = match.size;
    template = match.template;
  }

  let placements: PillowPlacementRow[] = [];
  if (template) {
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
      link: link ? { linkedAt: link.linked_at, linkedBy: await linkedByName(admin, link) } : null,
      fitting: fitting ? { id: fitting.id, fittedAt: fitting.fittedAt, label: fittingLabel(fitting) } : null,
      match,
      placements,
      items: items.items,
      colorOverrides: overrides.colorOverrides,
      dimensionOverrides: overrides.dimensionOverrides,
      templates: tpl.templates,
    },
  };
}
