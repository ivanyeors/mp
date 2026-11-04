/**
 * Group flat inventory filling Items into a SunburstMenu tree, categorised by
 * filling family (ring 1 = 3D / 6D / 6D+), leaves = the variants within a family.
 * Pure — no React runtime (type-only SunburstNode import). Input typed structurally
 * so lib/ stays free of the UI FillingItem type.
 *
 * Seed data stores the type in `subtype` ("3D (S)", "6D (L)", "6D+ (Folded)") with
 * name="filling", but real inventory can carry it in `name` (or lowercase, or leave
 * subtype null) — so the density is read from whichever field has it.
 */
import type { SunburstNode } from "@/components/ui/sunburst-menu-layout";

export type FillingItemLike = {
  id: number;
  name: string;
  subtype: string | null;
  size: string | null;
};

/** Leading density token + an optional immediate premium "+", case-insensitive. */
const DENSITY = /^\s*(\d+D)(\+)?/i;

/**
 * A Cervical Neck Support: an Accessories Item staff may also place inside a
 * premium pillow, where it is in the pillow's MSRP like the fillings. Matched by
 * type name — inventory has no category of its own for it.
 */
export const NECK_SUPPORT = /cervical|neck support/i;

export function isNeckSupportItem(item: { category?: string | null; name: string }): boolean {
  return item.category === "accessories" && NECK_SUPPORT.test(item.name);
}

/** PostgREST `.or()` filter for every Item the x-ray may place: fillings plus neck supports. */
export const PLACEABLE_ITEMS_OR =
  "category.eq.filling,and(category.eq.accessories,or(name.ilike.*cervical*,name.ilike.*neck support*))";

/** Filling family from a descriptor like "6D+ (Folded)" or "3D-S" → 3D / 6D / 6D+. */
export function fillingFamily(descriptor: string | null): { key: string; label: string } {
  const s = descriptor?.trim() ?? "";
  if (NECK_SUPPORT.test(s)) return { key: "neck", label: "Neck support" };
  const m = s.match(DENSITY);
  if (!m) return { key: "other", label: "Other" };
  const density = m[1].toUpperCase(); // "6D"
  const premium = Boolean(m[2]) || s.endsWith("+"); // "6D+ (…)" or legacy "6D-L+"
  const label = premium ? `${density}+` : density;
  return { key: label.toLowerCase(), label };
}

/**
 * The type descriptor for an item: prefer whichever of subtype/name carries a
 * density. Live inventory leaves `subtype` null and names the type ("6D Fold"),
 * so anything keyed on subtype alone sees every filling as the same thing.
 */
export function fillingDescriptor(item: Pick<FillingItemLike, "name" | "subtype">): string {
  for (const c of [item.subtype, item.name]) {
    if (c && DENSITY.test(c)) return c.trim();
  }
  return (item.name || item.subtype || "").trim();
}

/**
 * A piece's label as lines: the type, then the size when the type does not
 * already say it — ["6D Fold", "S"], ["6D (L)"]. Empty when the type is unknown.
 */
export function fillingLabelLines(descriptor: string | null, size: string | null): string[] {
  const type = descriptor?.trim() ?? "";
  const sz = size?.trim() ?? "";
  if (!type) return [];
  const tokens = type.toUpperCase().split(/[\s()-]+/);
  return sz && !tokens.includes(sz.toUpperCase()) ? [type, sz] : [type];
}

/** Lines written inside a piece: as fillingLabelLines, with a neck support shortened to "Neck". */
export function pieceLabelLines(descriptor: string | null, size: string | null): string[] {
  return NECK_SUPPORT.test(descriptor ?? "")
    ? fillingLabelLines("Neck", size)
    : fillingLabelLines(descriptor, size);
}

/** Clean label for a placed piece, e.g. "6D (L)" or "6D Fold S" — not "filling (6D (L))". */
export function fillingLabel(item: FillingItemLike): string {
  return fillingLabelLines(fillingDescriptor(item), item.size).join(" ") || `Item #${item.id}`;
}

/** Variant within a family: the parenthetical, else the descriptor minus its density. */
function variantLabel(descriptor: string): string {
  const paren = descriptor.match(/\(([^)]+)\)/)?.[1];
  if (paren) return paren.trim();
  const stripped = descriptor.replace(DENSITY, "").replace(/^[\s\-+]+/, "").trim();
  return stripped || descriptor.trim();
}

/** Sort rank: 3D < 6D < 6D+ < Neck support < Other. */
function familyRank(key: string): number {
  if (key === "other") return Infinity;
  if (key === "neck") return 1000;
  const density = Number(key.match(/^(\d+)d/)?.[1] ?? 0);
  return density + (key.endsWith("+") ? 0.5 : 0);
}

export function fillingItemsToSunburst(items: FillingItemLike[]): SunburstNode[] {
  const groups = new Map<string, { label: string; items: FillingItemLike[] }>();
  for (const item of items) {
    const fam = fillingFamily(fillingDescriptor(item));
    const g = groups.get(fam.key) ?? { label: fam.label, items: [] };
    g.items.push(item);
    groups.set(fam.key, g);
  }

  const nodes: SunburstNode[] = [];
  for (const [key, g] of [...groups].sort((a, b) => familyRank(a[0]) - familyRank(b[0]))) {
    // Collapse literal duplicate rows (same name+subtype+size), keep the lowest id.
    const unique = new Map<string, FillingItemLike>();
    for (const item of g.items) {
      const identity = `${item.name.trim().toLowerCase()}|${item.subtype ?? ""}|${item.size ?? ""}`;
      const seen = unique.get(identity);
      if (!seen || item.id < seen.id) unique.set(identity, item);
    }
    const sorted = [...unique.values()].sort((a, b) => a.id - b.id);

    const isOther = key === "other";
    const usedLabels = new Set<string>();
    const leaves: SunburstNode[] = sorted.map((item) => {
      // Real family → show the variant (S/M/L/Folded…); Other → the item name;
      // neck supports differ only by size.
      let label = isOther
        ? item.name.trim()
        : key === "neck"
          ? (item.size?.trim() ?? "")
          : variantLabel(fillingDescriptor(item));
      if (!label) label = item.name.trim() || `Item #${item.id}`;
      if (usedLabels.has(label)) label = `${label}${item.size ? ` (${item.size})` : ` #${item.id}`}`;
      usedLabels.add(label);
      return { id: String(item.id), label };
    });

    if (leaves.length > 0) nodes.push({ id: `fam:${key}`, label: g.label, children: leaves });
  }

  return nodes;
}
