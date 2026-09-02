import { loadAssignPrep, type AssignPrep } from "@/lib/results/assign-prep";
import {
  BOLSTER_LENGTHS,
  type ComposedSellableKey,
} from "@/lib/results/composed-sellable";
import {
  parseRecommendationRecord,
  resolveAssignHintTemplateId,
  selectAssignHintSource,
} from "@/lib/rules-engine";
import { supabaseAdmin } from "@/lib/supabase/server";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

/** The subset of the response row the assignment panel derives its state from. */
export interface AssignSeedRow {
  status?: string | null;
  product_type?: string | null;
  suggested_size?: string | null;
  suggested_tier?: string | null;
  suggested_length?: string | null;
  assigned_size?: string | null;
  assigned_tier?: string | null;
  assigned_length?: string | null;
  recommendation_record?: unknown;
  filling_fingerprint?: unknown;
}

/**
 * True when the result is assignable — the same `canAssign` gate the client
 * uses before it loads the assignment preview.
 */
export function canAssignResult(row: AssignSeedRow | null | undefined): boolean {
  return row?.status === "held";
}

/**
 * Reproduces the assign-panel state the client derives on first render
 * (size/tier/length fall back suggested → engine recommendation) and turns it
 * into the `/api/results/assign/prep` request it would have fired. Returns
 * null when that first render would not request a preview at all, or when the
 * derived key is not a valid composed-sellable key — the client then loads it
 * itself, unchanged.
 */
function resolveAssignPrepRequest(
  row: AssignSeedRow,
  recommended: { size: string; tier: string } | null,
): { key: ComposedSellableKey; preferredTemplateId: number | null; hintSource: "engine" | "default" } | null {
  if (!canAssignResult(row)) return null;

  const productType = row.product_type === "bolster" ? "bolster" : "pillow";
  const size = row.assigned_size ?? row.suggested_size ?? recommended?.size ?? "M";
  const tier = row.assigned_tier ?? row.suggested_tier ?? recommended?.tier ?? "basic";
  const length = row.assigned_length ?? row.suggested_length ?? "";
  const sizeKey = productType === "bolster" ? length : size;
  if (!sizeKey) return null;

  const sizeScopeChanged =
    productType === "bolster"
      ? Boolean(length && row.suggested_length && length !== row.suggested_length)
      : (row.suggested_size != null && size !== row.suggested_size) ||
        (row.suggested_tier != null && tier !== row.suggested_tier);

  const engineRecord = parseRecommendationRecord(row.recommendation_record ?? null);
  const hintInput = {
    engineTemplateId: engineRecord?.templateId,
    sizeScopeChanged,
    hasAssistFillingSnapshot: Boolean(row.filling_fingerprint),
  };
  const hintSource = selectAssignHintSource(hintInput);
  const preferredTemplateId = resolveAssignHintTemplateId({
    ...hintInput,
    defaultTemplateId: null,
  });

  if (productType === "bolster") {
    if (!(BOLSTER_LENGTHS as readonly string[]).includes(length)) return null;
    return {
      key: { productType: "bolster", length: length as (typeof BOLSTER_LENGTHS)[number] },
      preferredTemplateId,
      hintSource,
    };
  }

  if (!(PILLOW_SIZES as readonly string[]).includes(size)) return null;
  if (tier !== "basic" && tier !== "premium") return null;
  return {
    key: {
      productType: "pillow",
      size: size as (typeof PILLOW_SIZES)[number],
      tier,
    },
    preferredTemplateId,
    hintSource,
  };
}

/**
 * The assignment preview the result detail page would fetch on mount, or null
 * when it would not fetch one (or the load failed) — in which case the client
 * falls back to its own fetch.
 */
export async function loadResultAssignPrep(
  row: AssignSeedRow,
  recommended: { size: string; tier: string } | null,
): Promise<AssignPrep | null> {
  const request = resolveAssignPrepRequest(row, recommended);
  if (!request) return null;

  const result = await loadAssignPrep(supabaseAdmin(), request.key, {
    preferredTemplateId: request.preferredTemplateId,
    hintSource: request.hintSource,
  });
  return result.ok ? result.prep : null;
}

export interface FillingItemOption {
  id: number;
  label: string;
  name: string;
  subtype: string | null;
  size: string | null;
}

/**
 * Filling items for the spatial editor. Service-role equivalent of the browser
 * query the detail page runs against `items`; the client keeps its own copy for
 * refreshes.
 */
export async function loadFillingItems(): Promise<FillingItemOption[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("items")
    .select("id,name,subtype,size")
    .eq("category", "filling")
    .eq("is_active", true)
    .order("name");

  return (data ?? []).map((i) => ({
    id: Number(i.id),
    label: i.subtype ? `${i.name} (${i.subtype})` : i.name,
    // name/subtype/size feed the bolster picker's family grouping.
    name: i.name,
    subtype: i.subtype ?? null,
    size: i.size ?? null,
  }));
}
