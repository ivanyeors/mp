/**
 * Content rules the Page Builder's inspector checks as Staff type. Kept apart
 * from `validation.ts`, which builds zod schemas at import: importing that
 * into a client component would ship zod to the browser for a few constants.
 */

/** A button link: a path on this site, or an https URL. */
export function isAllowedLinkUrl(value: string): boolean {
  const url = value.trim();
  // `//host` and `/\host` are read by browsers as another site.
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** More than this and the band is a wall, not a pick; the cards are meant to be curated. */
export const MAX_TIKTOK_VIDEOS = 20;

/** Hard ceiling on a card's hook. The card shows three lines (about 50 characters). */
export const TIKTOK_HOOK_MAX_CHARS = 120;
