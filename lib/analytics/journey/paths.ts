import type { Locale } from "@/lib/i18n/locales";
import { stripLocale, withLocale } from "@/lib/i18n/routing";

/** Admin Panel paths must never enter the journey store. */
export function isAdminJourneyPath(pathname: string): boolean {
  const base = stripLocale(pathname);
  return base === "/settings" || base.startsWith("/settings/");
}

/** Storefront hash link for an exit section (Admin lang + locale-stripped journey path). */
export function exitSectionHref(
  locale: Locale,
  path: string,
  sectionId: string,
): string {
  return `${withLocale(path, locale)}#${sectionId}`;
}

/** Section child nodes are `path#sectionId`; sinks/pages are not. */
export function isSectionChildPath(path: string): boolean {
  return path.includes("#");
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
