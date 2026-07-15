import { stripLocale } from "@/lib/i18n/routing";

/** Admin Panel paths must never enter the journey store. */
export function isAdminJourneyPath(pathname: string): boolean {
  const base = stripLocale(pathname);
  return base === "/settings" || base.startsWith("/settings/");
}

/** Normalize storefront path for graph nodes (locale-stripped, no query/hash). */
export function normalizeJourneyPath(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  let path = raw.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);
  const base = stripLocale(path);
  if (!base || isAdminJourneyPath(base)) return null;
  // collapse trailing slash except root
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}
