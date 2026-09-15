/**
 * Size membership for Filling Templates.
 *
 * A Filling Template serves a SET of size keys, not one (CONTEXT.md). The set
 * is persisted in `bom_template_keys`; `bom_templates.key` is kept in step with
 * the canonically-first member so legacy readers stay truthful. Pure — no I/O.
 */

export type FillingKind = "pillow" | "bolster";

/** Pillow size keys, smallest first. Order is the canonical sort for membership. */
export const PILLOW_TEMPLATE_KEYS = ["XS", "S", "M", "L", "XL"] as const;
/** Bolster length keys, shortest first. */
export const BOLSTER_TEMPLATE_KEYS = ["short", "medium", "long"] as const;

export function templateKeysForKind(kind: FillingKind): readonly string[] {
  return kind === "bolster" ? BOLSTER_TEMPLATE_KEYS : PILLOW_TEMPLATE_KEYS;
}

/** Human label for one key — sizes read as "M", lengths as "Medium". */
export function templateKeyLabel(kind: FillingKind, key: string): string {
  return kind === "bolster" ? key.charAt(0).toUpperCase() + key.slice(1) : key;
}

/**
 * Validate and canonicalise a membership set: known keys for the kind, no
 * duplicates, at least one, sorted smallest-first. A template with no sizes
 * would be invisible everywhere, so an empty set is an error rather than a
 * silent no-op.
 */
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

/** The key written back to `bom_templates.key` — always a real member. */
export function primaryTemplateKey(kind: FillingKind, keys: readonly string[]): string {
  const normalized = normalizeTemplateKeys(kind, keys);
  return normalized.ok ? normalized.keys[0] : keys[0];
}

/** Membership test. `keys` is the authority; `key` alone is only the primary. */
export function templateServesKey(template: { keys?: readonly string[]; key?: string }, key: string): boolean {
  if (template.keys && template.keys.length) return template.keys.includes(key);
  return template.key === key;
}

/** "S, M and L" — for warnings that must name what else a save touches. */
export function formatTemplateKeys(kind: FillingKind, keys: readonly string[]): string {
  const labels = keys.map((k) => templateKeyLabel(kind, k));
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
