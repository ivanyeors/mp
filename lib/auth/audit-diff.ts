import { isPermission, permissionEntry } from "@/lib/auth/permissions";

/**
 * Readable access changes for the Audit Log. Role and Telegram-link entries
 * carry permission-key arrays in `before` / `after`; this turns them into the
 * page labels that were added and removed, so a reviewer reads "+ FAQ,
 * − Orders" instead of two JSON arrays. Unknown keys show as the raw key.
 */

/**
 * The access entity types Users & permissions writes, in filter-chip order.
 * `also` are the names the same changes were logged under before ADR 0023, so
 * a chip shows the whole history.
 */
export const ACCESS_ENTITY_TYPES = [
  { type: "member", label: "Members", also: ["admin_user"] },
  { type: "role", label: "Roles", also: [] },
  { type: "staff_profile", label: "Staff profiles", also: [] },
  { type: "telegram_link", label: "Telegram links", also: ["telegram_operator"] },
] as const;

/** Every entity_type a chip covers; null for an unknown chip (no filter). */
export function entityTypesFor(chip: string | null | undefined): string[] | null {
  const entry = ACCESS_ENTITY_TYPES.find((e) => e.type === chip);
  return entry ? [entry.type, ...entry.also] : null;
}

const KEY_FIELDS = ["permissions", "actions"] as const;

function keysOf(snapshot: unknown, field: string): string[] | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[field];
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

const label = (key: string) => (isPermission(key) ? permissionEntry(key).label : key);

export type PermissionDiff = { field: string; added: string[]; removed: string[] };

/**
 * Added / removed page labels for each permission-array field present on
 * either side. Null when neither snapshot has one (render the JSON instead).
 */
export function permissionDiff(before: unknown, after: unknown): PermissionDiff[] | null {
  const diffs: PermissionDiff[] = [];
  for (const field of KEY_FIELDS) {
    const b = keysOf(before, field);
    const a = keysOf(after, field);
    if (!b && !a) continue;
    const was = new Set(b ?? []);
    const now = new Set(a ?? []);
    diffs.push({
      field,
      added: [...now].filter((k) => !was.has(k)).map(label),
      removed: [...was].filter((k) => !now.has(k)).map(label),
    });
  }
  return diffs.length ? diffs : null;
}
