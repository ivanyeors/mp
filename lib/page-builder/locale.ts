import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * Locale resolution for Landing section content (CONTEXT.md — **Landing section**).
 *
 * A section's `content` is an override layer over its i18n message: components read
 * `content.title ?? messages.home.x.title`. Content was single-locale, so an English
 * override typed in the Page Builder rendered on the zh-CN page too — the fallback
 * never fired because the key was present.
 *
 * The fix is to project content down to one locale *before* the section dispatcher, so
 * all fifteen section components keep their existing `??` lines and a new section
 * cannot reintroduce the bug. A field with nothing for this locale is **removed**, not
 * set to undefined, so `??` sees a missing key and the translated default wins.
 */

/**
 * Keys that are never copy, and so are passed through for every locale.
 *
 * Without this an image URL would be treated as an English string and dropped on the
 * zh-CN page. Keep this list in step with the content interfaces in
 * `lib/types/landing-sections.ts`.
 */
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

/**
 * Non-localised keys that identify a record rather than carry content.
 *
 * They survive resolution like any other non-localised key, but they do not on their
 * own keep a nested object alive: a card left holding nothing but its icon `key` has
 * no copy for this locale and must drop out, so the whole list falls back to i18n
 * instead of rendering a blank card.
 */
const IDENTIFIER_KEYS = new Set(["key", "media_asset_id"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when every key is a supported locale — the only safe test, because content is
 * full of nested objects (a card's `label`/`description`, the neck-pains "how it feels"
 * trio) that must not be mistaken for translations.
 */
export function isLocaleMap(value: unknown): value is Partial<Record<Locale, unknown>> {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((key) => (SUPPORTED_LOCALES as readonly string[]).includes(key));
}

/**
 * Resolve one value, returning `undefined` when this locale has nothing to show.
 * Callers drop the key entirely on `undefined`.
 */
function resolveValue(value: unknown, locale: Locale): unknown {
  if (value === null || value === undefined) return undefined;

  if (isLocaleMap(value)) {
    const picked = value[locale];
    return typeof picked === "string" && picked.trim() === "" ? undefined : picked;
  }

  if (typeof value === "string") {
    // Legacy single-locale override: English only, so other locales fall back to i18n.
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

  // Numbers and booleans are not copy.
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

/** Project a section's stored content down to the copy for one locale. */
export function resolveContentLocale(
  content: Record<string, unknown> | null | undefined,
  locale: Locale,
): Record<string, unknown> {
  if (!content) return {};
  return resolveObject(content, locale);
}

// --- Editor helpers -------------------------------------------------------------

/**
 * Read one stored value as the inspector should show it for the locale being edited.
 * Returns "" rather than undefined so inputs stay controlled.
 */
export function readLocalisedValue(value: unknown, locale: Locale): string {
  if (isLocaleMap(value)) {
    const picked = value[locale];
    return typeof picked === "string" ? picked : "";
  }
  // Legacy bare string counts as English, matching how it now renders.
  if (typeof value === "string") return locale === DEFAULT_LOCALE ? value : "";
  return "";
}

/**
 * Write one stored value for the locale being edited, upgrading a legacy bare string
 * into a locale map (keeping the old value as English) so editing Chinese never drops
 * English copy that is already live. Returns `undefined` when nothing is left, so the
 * caller can drop the key and let the i18n default win again.
 */
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

/** Field-keyed wrapper over `readLocalisedValue`, honouring the non-localised keys. */
export function readLocalisedField(
  content: Record<string, unknown>,
  key: string,
  locale: Locale,
): string {
  const value = content[key];
  if (NON_LOCALISED_KEYS.has(key)) return typeof value === "string" ? value : "";
  return readLocalisedValue(value, locale);
}

/** Field-keyed wrapper over `writeLocalisedValue`, honouring the non-localised keys. */
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
