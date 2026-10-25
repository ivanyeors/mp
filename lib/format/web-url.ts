/**
 * A user-supplied link as an http(s) URL, or null.
 *
 * Customers and partners type links that end up as `href`s in front of Staff
 * and visitors. Only http and https survive, so `javascript:`, `data:` and
 * friends never become a clickable link. A bare domain ("mpillow.com/shop"),
 * the usual way people type a website, gets `https://`.
 */
export function toWebUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
