// ============================================================
// HTML escaping + URL safety for email templates
// ============================================================
//
// Split out of base.ts so components.ts can use it without importing the shell
// (base.ts imports components.ts, so the dependency has to run the other way).
//
// `base.ts` re-exports escapeHtml/escapeAttr/safeUrl, so the existing
// `import { escapeHtml } from "./base"` call sites keep working.

/** Escape a plain-text value for insertion into HTML text or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Same escaping as {@link escapeHtml}; named separately so attribute-context
 * call sites read as intentional rather than looking like a copy-paste.
 */
export const escapeAttr = escapeHtml;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Control characters and whitespace that clients strip before resolving a URL. */
const URL_NOISE = /[\u0000-\u0020]/g;

/**
 * Return an href-safe absolute URL, or `fallback` when the input is missing or
 * uses a protocol we refuse to emit.
 *
 * `escapeHtml` alone is NOT enough for an href: it leaves `javascript:alert(1)`
 * completely intact. Everything that ends up in an `href`/`src` goes through
 * here, and the button()/link() components call it themselves so a template
 * physically cannot emit an unvalidated URL.
 *
 * Rejects: javascript:, data:, vbscript:, file:, protocol-relative `//host`
 * (no protocol of its own — it would inherit the client's), and control /
 * whitespace obfuscation such as `java\tscript:` (stripped before parsing, so
 * the URL parser sees the real protocol instead of reading it as relative).
 *
 * The return value is already escaped for attribute context — do not escape it
 * again at the call site.
 */
export function safeUrl(url: string | null | undefined, fallback = ""): string {
  if (!url) return fallback;
  const cleaned = url.replace(URL_NOISE, "");
  if (!cleaned) return fallback;
  if (cleaned.startsWith("//")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    // Relative URL. Emails have no page origin to resolve against, so a
    // relative href is always a bug — never emit one.
    return fallback;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return fallback;
  return escapeHtml(parsed.toString());
}

/**
 * Collapse an HTML fragment to plain text. Used to derive preheader text and to
 * assert plain-text parity in tests — not a sanitiser.
 */
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
