import { parseSurfaceKey } from "./surface-key";

/**
 * Public pathname (no locale) for a FAQ surface preview link.
 * Product surfaces need `productSlug` from the shop catalog.
 */
export function pageFaqPreviewPath(
  surfaceKey: string,
  productSlug?: string | null
): string | null {
  const parsed = parseSurfaceKey(surfaceKey);
  if (!parsed) return null;
  if (parsed.kind === "fixed") {
    if (parsed.surface === "home") return "/";
    if (parsed.surface === "mp-config") return "/mp-config";
    return "/mbolster-config";
  }
  if (!productSlug) return null;
  return `/shop/${productSlug}`;
}

export const FIXED_SURFACE_OPTIONS = [
  { key: "home", label: "Home" },
  { key: "mp-config", label: "mp-config" },
  { key: "mbolster-config", label: "mbolster-config" },
] as const;
