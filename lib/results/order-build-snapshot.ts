/** Frozen production build snapshot written onto order_items at Accept. */

import type { BuildLine, BuildLineRole } from "@/lib/build-assembly";
import type { PriceResultOutput } from "@/lib/result-pricing";
import type { ServiceLine } from "@/lib/pricing/service-lines";
import type { BolsterPlacementRow, PillowPlacementRow } from "@/lib/spatial-fillings/core";

export type NamedBuildLine = BuildLine & { name: string };

export type ResultOrderBuildSnapshot = {
  result_id: string;
  product_type: "pillow" | "bolster";
  assigned_size: string | null;
  assigned_tier: string | null;
  assigned_length: string | null;
  /** Null when the mix diverged from every catalog template (custom spatial mix). */
  filling_template_id: number | null;
  filling_template_name: string | null;
  /** Spatial placement breakdown for the warehouse (absent on pre-spatial Results).
   * Pillow cell rows or bolster slot rows, per product_type. */
  filling_placements?: Array<PillowPlacementRow | BolsterPlacementRow>;
  preference_lines: NamedBuildLine[];
  addon_lines: NamedBuildLine[];
  build_lines: NamedBuildLine[];
  cogs: number;
  pricing: PriceResultOutput;
  /** Service fees charged with this build, frozen at Accept (ADR 0024). Absent before it. */
  service_lines?: ServiceLine[];
};

const ROLE_LABELS: Record<BuildLineRole, string> = {
  composed: "Composed sellable",
  filling: "Filling Template",
  preference: "Preferences",
  addon: "Add-ons",
};

export function buildLineRoleLabel(role: BuildLineRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function isResultOrderBuildSnapshot(
  value: unknown,
): value is ResultOrderBuildSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.result_id === "string" &&
    (s.product_type === "pillow" || s.product_type === "bolster") &&
    Array.isArray(s.build_lines)
  );
}

export function buildResultOrderSnapshot(input: {
  resultId: string;
  productType: "pillow" | "bolster";
  assignedSize: string | null;
  assignedTier: string | null;
  assignedLength: string | null;
  fillingTemplateId: number | null;
  fillingTemplateName: string | null;
  fillingPlacements?: Array<PillowPlacementRow | BolsterPlacementRow>;
  buildLines: BuildLine[];
  nameByItem: Map<number, string>;
  cogs: number;
  pricing: PriceResultOutput;
  serviceLines?: ServiceLine[];
}): ResultOrderBuildSnapshot {
  const named = (line: BuildLine): NamedBuildLine => ({
    ...line,
    name: input.nameByItem.get(line.item_id) ?? `Item #${line.item_id}`,
  });
  const build_lines = input.buildLines.map(named);
  return {
    result_id: input.resultId,
    product_type: input.productType,
    assigned_size: input.assignedSize,
    assigned_tier: input.assignedTier,
    assigned_length: input.assignedLength,
    filling_template_id: input.fillingTemplateId,
    filling_template_name: input.fillingTemplateName,
    ...(input.fillingPlacements?.length ? { filling_placements: input.fillingPlacements } : {}),
    preference_lines: build_lines.filter((l) => l.role === "preference"),
    addon_lines: build_lines.filter((l) => l.role === "addon"),
    build_lines,
    cogs: input.cogs,
    pricing: input.pricing,
    ...(input.serviceLines?.length ? { service_lines: input.serviceLines } : {}),
  };
}

/** Group named lines by role for production UI (stable role order). */
export function groupBuildLinesByRole(
  lines: NamedBuildLine[],
): Array<{ role: BuildLineRole; label: string; lines: NamedBuildLine[] }> {
  const order: BuildLineRole[] = ["composed", "filling", "preference", "addon"];
  return order
    .map((role) => ({
      role,
      label: buildLineRoleLabel(role),
      lines: lines.filter((l) => l.role === role),
    }))
    .filter((g) => g.lines.length > 0);
}
