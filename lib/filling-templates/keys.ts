export type FillingKind = "pillow" | "bolster";

export const PILLOW_TEMPLATE_KEYS = ["XS", "S", "M", "L", "XL"] as const;
export const BOLSTER_TEMPLATE_KEYS = ["short", "medium", "long"] as const;

export function templateKeysForKind(kind: FillingKind): readonly string[] {
  return kind === "bolster" ? BOLSTER_TEMPLATE_KEYS : PILLOW_TEMPLATE_KEYS;
}

export function templateKeyLabel(kind: FillingKind, key: string): string {
  return kind === "bolster" ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

export function normalizeTemplateKeys(
  kind: FillingKind,
  keys: readonly string[],
): { ok: true; keys: string[] } | { ok: false; error: string } {
  const allowed = templateKeysForKind(kind);
  const seen = new Set<string>();
  for (const key of keys) {
    if (!allowed.includes(key)) {
      return { ok: false, error: `Unknown ${kind === "bolster" ? "length" : "size"} "${key}"` };
    }
    seen.add(key);
  }
  if (seen.size === 0) {
    return {
      ok: false,
      error: `A Filling Template must apply to at least one ${kind === "bolster" ? "length" : "size"}`,
    };
  }
  return { ok: true, keys: allowed.filter((k) => seen.has(k)) };
}

export function primaryTemplateKey(kind: FillingKind, keys: readonly string[]): string {
  const normalized = normalizeTemplateKeys(kind, keys);
  return normalized.ok ? normalized.keys[0] : keys[0];
}

export function templateServesKey(template: { keys?: readonly string[]; key?: string }, key: string): boolean {
  if (template.keys && template.keys.length) return template.keys.includes(key);
  return template.key === key;
}

export function formatTemplateKeys(kind: FillingKind, keys: readonly string[]): string {
  const labels = keys.map((k) => templateKeyLabel(kind, k));
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
