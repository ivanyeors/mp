import { FIXED_FAQ_SURFACES, type FaqSurfaceKey, type FixedFaqSurface } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIXED_SET = new Set<string>(FIXED_FAQ_SURFACES);

export function productSurfaceKey(productId: string): FaqSurfaceKey {
  return `product:${productId}`;
}

export function isValidSurfaceKey(key: string): key is FaqSurfaceKey {
  if (FIXED_SET.has(key)) return true;
  if (!key.startsWith("product:")) return false;
  return UUID_RE.test(key.slice("product:".length));
}

export function parseSurfaceKey(
  key: string
): { kind: "fixed"; surface: FixedFaqSurface } | { kind: "product"; productId: string } | null {
  if (!isValidSurfaceKey(key)) return null;
  if (FIXED_SET.has(key)) return { kind: "fixed", surface: key as FixedFaqSurface };
  return { kind: "product", productId: key.slice("product:".length) };
}
