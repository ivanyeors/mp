import type { SunburstNode } from "@/components/ui/sunburst-menu-layout";

export type FillingItemLike = {
  id: number;
  name: string;
  subtype: string | null;
  size: string | null;
};

const DENSITY = /^\s*(\d+D)(\+)?/i;

export const NECK_SUPPORT = /cervical|neck support/i;

export function isNeckSupportItem(item: { category?: string | null; name: string }): boolean {
  return item.category === "accessories" && NECK_SUPPORT.test(item.name);
}

export const EAR_PAD = /ear comfort/i;

export function isEarPadItem(item: { category?: string | null; name: string }): boolean {
  return item.category === "accessories" && EAR_PAD.test(item.name);
}

export function isInPillowAccessory(item: { category?: string | null; name: string }): boolean {
  return isNeckSupportItem(item) || isEarPadItem(item);
}

export const PLACEABLE_ITEMS_OR =
  "category.eq.filling,and(category.eq.accessories,or(name.ilike.*cervical*,name.ilike.*neck support*,name.ilike.*ear comfort*))";

export function fillingFamily(descriptor: string | null): { key: string; label: string } {
  const s = descriptor?.trim() ?? "";
  if (NECK_SUPPORT.test(s)) return { key: "neck", label: "Neck support" };
  if (EAR_PAD.test(s)) return { key: "ear", label: "Ear pad" };
  const m = s.match(DENSITY);
  if (!m) return { key: "other", label: "Other" };
  const density = m[1].toUpperCase();
  const premium = Boolean(m[2]) || s.endsWith("+");
  const label = premium ? `${density}+` : density;
  return { key: label.toLowerCase(), label };
}

export function fillingDescriptor(item: Pick<FillingItemLike, "name" | "subtype">): string {
  for (const c of [item.subtype, item.name]) {
    if (c && DENSITY.test(c)) return c.trim();
  }
  return (item.name || item.subtype || "").trim();
}

export function fillingLabelLines(descriptor: string | null, size: string | null): string[] {
  const type = descriptor?.trim() ?? "";
  const sz = size?.trim() ?? "";
  if (!type) return [];
  const tokens = type.toUpperCase().split(/[\s()-]+/);
  return sz && !tokens.includes(sz.toUpperCase()) ? [type, sz] : [type];
}

export function pieceLabelLines(descriptor: string | null, size: string | null): string[] {
  if (NECK_SUPPORT.test(descriptor ?? "")) return fillingLabelLines("Neck", size);
  if (EAR_PAD.test(descriptor ?? "")) return fillingLabelLines("Ear pad", size);
  return fillingLabelLines(descriptor, size);
}

export function fillingLabel(item: FillingItemLike): string {
  return fillingLabelLines(fillingDescriptor(item), item.size).join(" ") || `Item #${item.id}`;
}

function variantName(descriptor: string): string {
  const paren = descriptor.match(/\(([^)]+)\)/)?.[1];
  if (paren) return paren.trim();
  return descriptor.replace(DENSITY, "").replace(/^[\s\-+]+/, "").trim();
}

function variantLabel(item: FillingItemLike): string {
  const variant = variantName(fillingDescriptor(item));
  return fillingLabelLines(variant || null, item.size).join(" ") || item.size?.trim() || "";
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];
function leafRank(label: string): [string, number] {
  const words = label.split(" ");
  const size = SIZE_ORDER.indexOf(words.at(-1)!.toUpperCase());
  const variant = size >= 0 ? words.slice(0, -1).join(" ") : label;
  return [variant, size >= 0 ? size : SIZE_ORDER.length];
}

function familyRank(key: string): number {
  if (key === "other") return Infinity;
  if (key === "neck") return 1000;
  if (key === "ear") return 1001;
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
      let label = isOther
        ? item.name.trim()
        : key === "neck" || key === "ear"
          ? (item.size?.trim() ?? "")
          : variantLabel(item);
      if (!label) label = item.name.trim() || `Item #${item.id}`;
      if (usedLabels.has(label)) label = `${label}${item.size ? ` (${item.size})` : ` #${item.id}`}`;
      usedLabels.add(label);
      return { id: String(item.id), label };
    });
    if (!isOther) {
      leaves.sort((a, b) => {
        const [va, sa] = leafRank(a.label);
        const [vb, sb] = leafRank(b.label);
        return va === vb ? sa - sb : va === "" ? -1 : vb === "" ? 1 : va.localeCompare(vb);
      });
    }

    if (leaves.length > 0) nodes.push({ id: `fam:${key}`, label: g.label, children: leaves });
  }

  return nodes;
}
