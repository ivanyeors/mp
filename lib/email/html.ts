export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const escapeAttr = escapeHtml;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const URL_NOISE = /[\u0000-\u0020]/g;

export function safeUrl(url: string | null | undefined, fallback = ""): string {
  if (!url) return fallback;

  const colon = url.indexOf(":");
  const cleaned =
    colon === -1
      ? url.trim()
      : url.slice(0, colon).replace(URL_NOISE, "") + url.slice(colon);
  if (!cleaned) return fallback;
  if (cleaned.trimStart().startsWith("//")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(cleaned.trim());
  } catch {
    return fallback;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return fallback;
  return escapeHtml(parsed.toString());
}

export function stripTags(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&zwnj;/gi, "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
