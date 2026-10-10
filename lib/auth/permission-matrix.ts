/**
 * Ticking and unticking a page on the Roles matrix. Pure, so the editor and
 * its tests share it; the server re-applies `requires` on save regardless.
 *
 *  - Ticking a page also ticks what it requires, and says so.
 *  - Unticking a page another ticked page requires is blocked, with the reason.
 */
import { applyRequires, permissionEntry, type Permission } from "@/lib/auth/permissions";

export type ToggleResult =
  | { ok: true; next: Set<Permission>; note: string | null }
  | { ok: false; reason: string };

const label = (k: Permission) => permissionEntry(k).label;
const list = (keys: Permission[]) => keys.map(label).join(", ");

export function togglePermission(current: ReadonlySet<Permission>, key: Permission, on: boolean): ToggleResult {
  if (on) {
    const next = applyRequires([...current, key]);
    const also = [...next].filter((k) => k !== key && !current.has(k));
    const note = also.length ? `Also turned on ${list(also)} — ${label(key)} uses ${also.length === 1 ? "it" : "them"}.` : null;
    return { ok: true, next, note };
  }
  const dependents = [...current].filter((k) => k !== key && applyRequires([k]).has(key));
  if (dependents.length) {
    return { ok: false, reason: `${list(dependents)} ${dependents.length === 1 ? "uses" : "use"} ${label(key)}. Untick ${dependents.length === 1 ? "it" : "them"} first.` };
  }
  const next = new Set(current);
  next.delete(key);
  return { ok: true, next, note: null };
}

/** Whether two permission sets hold the same keys. */
export function samePermissions(a: Iterable<string>, b: Iterable<string>): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((k) => y.has(k));
}
