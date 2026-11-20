import { isPermission, permissionEntry } from "@/lib/auth/permissions";

export const ACCESS_ENTITY_TYPES = [
  { type: "member", label: "Members", also: ["admin_user"] },
  { type: "role", label: "Roles", also: [] },
  { type: "staff_profile", label: "Staff profiles", also: [] },
  { type: "telegram_link", label: "Telegram links", also: ["telegram_operator"] },
] as const;

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
