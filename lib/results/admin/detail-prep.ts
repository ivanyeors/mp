import { loadAssignPrep, type AssignPrep } from "@/lib/results/assign-prep";
import { fillingLabel, PLACEABLE_ITEMS_OR } from "@/lib/spatial-fillings/filling-groups";
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
import { fillingMixMode } from "@/lib/results/filling-mix";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

export interface AssignSeedRow {
  status?: string | null;
  order_id?: string | null;
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

export function canAssignResult(row: AssignSeedRow | null | undefined): boolean {
  return row?.status === "held";
}

export function canEditFillingMix(row: AssignSeedRow | null | undefined): boolean {
  if (!row) return false;
  return fillingMixMode({ status: row.status, order_id: row.order_id, product_type: row.product_type }) !== "view";
}

function resolveAssignPrepRequest(
  row: AssignSeedRow,
  recommended: { size: string; tier: string } | null,
): { key: ComposedSellableKey; preferredTemplateId: number | null; hintSource: "engine" | "default" } | null {
  if (!canEditFillingMix(row)) return null;

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

export async function loadFillingItems(): Promise<FillingItemOption[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("items")
    .select("id,name,subtype,size")
    .or(PLACEABLE_ITEMS_OR)
    .eq("is_active", true)
    .order("name");

  return (data ?? []).map((i) => ({
    id: Number(i.id),
    label: fillingLabel(i),
    name: i.name,
    subtype: i.subtype ?? null,
    size: i.size ?? null,
  }));
}
