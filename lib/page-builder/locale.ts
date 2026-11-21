import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

const NON_LOCALISED_KEYS = new Set([
  "image",
  "media_asset_id",
  "videoId",
  "buttonUrl",
  "tiktokUrl",
  "direction",
  "flip",
  "limit",
  "key",
]);

const IDENTIFIER_KEYS = new Set(["key", "media_asset_id"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLocaleMap(value: unknown): value is Partial<Record<Locale, unknown>> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((key) => (SUPPORTED_LOCALES as readonly string[]).includes(key));
}

function resolveValue(value: unknown, locale: Locale): unknown {
  if (value === null || value === undefined) return undefined;

  if (isLocaleMap(value)) {
    const picked = value[locale];
    return typeof picked === "string" && picked.trim() === "" ? undefined : picked;
  }

  if (typeof value === "string") {
    if (locale !== DEFAULT_LOCALE) return undefined;
    return value.trim() === "" ? undefined : value;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => resolveValue(item, locale)).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (isPlainObject(value)) {
    const resolved = resolveObject(value, locale);
    const hasContent = Object.keys(resolved).some((key) => !IDENTIFIER_KEYS.has(key));
    return hasContent ? resolved : undefined;
  }

  return value;
}

function resolveObject(content: Record<string, unknown>, locale: Locale): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (NON_LOCALISED_KEYS.has(key)) {
      if (value !== undefined && value !== null) out[key] = value;
      continue;
    }
    const resolved = resolveValue(value, locale);
    if (resolved !== undefined) out[key] = resolved;
  }
  return out;
}

export function resolveContentLocale(
  content: Record<string, unknown> | null | undefined,
  locale: Locale,
): Record<string, unknown> {
  if (!content) return {};
  return resolveObject(content, locale);
}

export function readLocalisedValue(value: unknown, locale: Locale): string {
  if (isLocaleMap(value)) {
    const picked = value[locale];
    return typeof picked === "string" ? picked : "";
  }
  if (typeof value === "string") return locale === DEFAULT_LOCALE ? value : "";
  return "";
}

export function writeLocalisedValue(current: unknown, locale: Locale, value: string): unknown {
  const map: Record<string, unknown> = isLocaleMap(current)
    ? { ...(current as Record<string, unknown>) }
    : typeof current === "string" && current !== ""
      ? { [DEFAULT_LOCALE]: current }
      : {};

  if (value === "") delete map[locale];
  else map[locale] = value;

  return Object.keys(map).length === 0 ? undefined : map;
}

export function readLocalisedField(
  content: Record<string, unknown>,
  key: string,
  locale: Locale,
): string {
  const value = content[key];
  if (NON_LOCALISED_KEYS.has(key)) return typeof value === "string" ? value : "";
  return readLocalisedValue(value, locale);
}

export function writeLocalisedField(
  content: Record<string, unknown>,
  key: string,
  locale: Locale,
  value: string,
): Record<string, unknown> {
  if (NON_LOCALISED_KEYS.has(key)) return { ...content, [key]: value };

  const written = writeLocalisedValue(content[key], locale, value);
  const next = { ...content };
  if (written === undefined) delete next[key];
  else next[key] = written;
  return next;
}

export { NON_LOCALISED_KEYS };
