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

/** Filling family from a descriptor like "6D+ (Folded)" or "3D-S" → 3D / 6D / 6D+. */
export function fillingFamily(descriptor: string | null): { key: string; label: string } {
  const s = descriptor?.trim() ?? "";
  const m = s.match(DENSITY);
  if (!m) return { key: "other", label: "Other" };
  const density = m[1].toUpperCase(); // "6D"
  const premium = Boolean(m[2]) || s.endsWith("+"); // "6D+ (…)" or legacy "6D-L+"
  const label = premium ? `${density}+` : density;
  return { key: label.toLowerCase(), label };
}

/** The type descriptor for an item: prefer whichever of subtype/name carries a density. */
function descriptorOf(item: FillingItemLike): string {
  for (const c of [item.subtype, item.name]) {
    if (c && DENSITY.test(c)) return c.trim();
  }
  return (item.name || item.subtype || "").trim();
}

/** Variant within a family: the parenthetical, else the descriptor minus its density. */
function variantLabel(descriptor: string): string {
  const paren = descriptor.match(/\(([^)]+)\)/)?.[1];
  if (paren) return paren.trim();
  const stripped = descriptor.replace(DENSITY, "").replace(/^[\s\-+]+/, "").trim();
  return stripped || descriptor.trim();
}

/** Sort rank: 3D < 6D < 6D+ < Other. */
function familyRank(key: string): number {
  if (key === "other") return Infinity;
  const density = Number(key.match(/^(\d+)d/)?.[1] ?? 0);
  return density + (key.endsWith("+") ? 0.5 : 0);
}

export function fillingItemsToSunburst(items: FillingItemLike[]): SunburstNode[] {
  const groups = new Map<string, { label: string; items: FillingItemLike[] }>();
  for (const item of items) {
    const fam = fillingFamily(descriptorOf(item));
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
      // Real family → show the variant (S/M/L/Folded…); Other → the item name.
      let label = isOther ? item.name.trim() : variantLabel(descriptorOf(item));
      if (!label) label = item.name.trim() || `Item #${item.id}`;
      if (usedLabels.has(label)) label = `${label}${item.size ? ` (${item.size})` : ` #${item.id}`}`;
      usedLabels.add(label);
      return { id: String(item.id), label };
    });

    if (leaves.length > 0) nodes.push({ id: `fam:${key}`, label: g.label, children: leaves });
  }

  return nodes;
}
