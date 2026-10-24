/**
 * Ticking and unticking a page on the Roles matrix. Pure, so the editor and
 * its tests share it; the server re-applies `requires` on save regardless.
 *
 *  - Ticking a page also ticks what it requires, and says so.
 *  - Unticking a page also unticks its tabs (Admin Panel keys with no sidebar
 *    page of their own that require it, such as Customers: make changes), and
 *    says so. A tab cannot work without its page.
 *  - Unticking a page another ticked page requires is blocked, with the reason.
 */
import { applyRequires, permissionEntry, type Permission } from "@/lib/auth/permissions";

export type ToggleResult =
  | { ok: true; next: Set<Permission>; note: string | null }
  | { ok: false; reason: string };

const label = (k: Permission) => permissionEntry(k).label;
const list = (keys: Permission[]) => keys.map(label).join(", ");

/** A key that is a tab of another page: on the Admin Panel, with no sidebar page of its own. */
const isTab = (k: Permission) => {
  const entry = permissionEntry(k);
  return entry.surface === "admin-panel" && !entry.href;
};

/**
 * The ticked tabs of `key`: those that require it, directly or through another
 * of its tabs (Customers → Customers: make changes → a tab that requires that).
 */
function tabsOf(current: ReadonlySet<Permission>, key: Permission): Permission[] {
  const leaving = new Set<Permission>([key]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const k of current) {
      if (leaving.has(k) || !isTab(k)) continue;
      if ((permissionEntry(k).requires ?? []).some((r) => leaving.has(r))) {
        leaving.add(k);
        grew = true;
      }
    }
  }
  leaving.delete(key);
  return [...leaving];
}

export function togglePermission(current: ReadonlySet<Permission>, key: Permission, on: boolean): ToggleResult {
  if (on) {
    const next = applyRequires([...current, key]);
    const also = [...next].filter((k) => k !== key && !current.has(k));
    const note = also.length ? `Also turned on ${list(also)} — ${label(key)} uses ${also.length === 1 ? "it" : "them"}.` : null;
    return { ok: true, next, note };
  }
  const tabs = tabsOf(current, key);
  const dependents = [...current].filter((k) => k !== key && !tabs.includes(k) && applyRequires([k]).has(key));
  if (dependents.length) {
    return { ok: false, reason: `${list(dependents)} ${dependents.length === 1 ? "uses" : "use"} ${label(key)}. Untick ${dependents.length === 1 ? "it" : "them"} first.` };
  }
  const next = new Set(current);
  next.delete(key);
  for (const t of tabs) next.delete(t);
  const note = tabs.length ? `Also turned off ${list(tabs)} — ${tabs.length === 1 ? "it needs" : "they need"} ${label(key)}.` : null;
  return { ok: true, next, note };
}

/** Whether two permission sets hold the same keys. */
export function samePermissions(a: Iterable<string>, b: Iterable<string>): boolean {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((k) => y.has(k));
}
