import type { Locale } from "@/lib/i18n/locales";
import { stripLocale, withLocale } from "@/lib/i18n/routing";
import { isPageBuilderPreviewRoute } from "@/lib/routing/preview-route";

export function isAdminJourneyPath(pathname: string): boolean {
  const base = stripLocale(pathname);
  if (isPageBuilderPreviewRoute(base)) return true;
  return base === "/settings" || base.startsWith("/settings/");
}

export function exitSectionHref(
  locale: Locale,
  path: string,
  sectionId: string,
): string {
  return `${withLocale(path, locale)}#${sectionId}`;
}

export function isSectionChildPath(path: string): boolean {
  return path.includes("#");
}

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
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}
