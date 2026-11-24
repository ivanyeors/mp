import type { BolsterPlacementRow, PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { BolsterVariant, ConfigLine, FillingLine } from "@/lib/types/customization";

export const STAFF_BUILD_SOURCE = "staff_order";

export type StaffBuildTemplate = { id: number; name: string };

export type StaffBuildSnapshot = {
  source: typeof STAFF_BUILD_SOURCE;
  product_type: "pillow" | "bolster";
  pillow_product_id: number | null;
  bolster_variant: BolsterVariant | null;
  filling_template_id: number | null;
  filling_template_name: string | null;
  based_on_template: StaffBuildTemplate | null;
  filling_placements: Array<PillowPlacementRow | BolsterPlacementRow>;
  config_lines: ConfigLine[];
  filling_lines: FillingLine[];
  total_addon_price: number;
  summary: string;
};

export function isStaffBuildSnapshot(value: unknown): value is StaffBuildSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    s.source === STAFF_BUILD_SOURCE &&
    (s.product_type === "pillow" || s.product_type === "bolster") &&
    Array.isArray(s.filling_placements) &&
    Array.isArray(s.filling_lines)
  );
}

export function fillingSourceLabel(build: {
  matched: StaffBuildTemplate | null;
  basedOn: StaffBuildTemplate | null;
}): string {
  if (build.matched) return build.matched.name;
  return build.basedOn ? `Adjusted from ${build.basedOn.name}` : "Custom mix";
}

export function staffBuildFillingLabel(snapshot: StaffBuildSnapshot): string {
  return fillingSourceLabel({
    matched:
      snapshot.filling_template_id != null && snapshot.filling_template_name
        ? { id: snapshot.filling_template_id, name: snapshot.filling_template_name }
        : null,
    basedOn: snapshot.based_on_template,
  });
}

export function buildPartsLabel(parts: { cover: string | null; case: string | null }): string {
  return [parts.cover ? `Cover: ${parts.cover}` : null, parts.case ? `Case: ${parts.case}` : null]
    .filter(Boolean)
    .join(" · ");
}
