/** ISO country on Visit from request geo headers. Never from locale cookie. */

export const UNKNOWN_COUNTRY = "Unknown";

const ISO2 = /^[A-Z]{2}$/;

/** Normalize platform geo code → ISO2 or Unknown. */
export function normalizeCountryCode(raw: string | null | undefined): string {
  if (raw == null) return UNKNOWN_COUNTRY;
  const c = raw.trim().toUpperCase();
  if (!c || c === "XX" || c === "T1" || c === "ZZ") return UNKNOWN_COUNTRY;
  if (ISO2.test(c)) return c;
  return UNKNOWN_COUNTRY;
}

type HeaderBag =
  | Headers
  | { get(name: string): string | null }
  | Record<string, string | string[] | null | undefined>;

function headerGet(headers: HeaderBag, name: string): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string | string[] | null | undefined>;
  const v = rec[name] ?? rec[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Derive country from CDN/platform headers only.
 * Prefers Vercel → Cloudflare → generic. Does not read cookies or Accept-Language.
 */
export function resolveCountryFromHeaders(headers: HeaderBag): string {
  const raw =
    headerGet(headers, "x-vercel-ip-country") ||
    headerGet(headers, "cf-ipcountry") ||
    headerGet(headers, "x-country-code");
  return normalizeCountryCode(raw);
}

/** Stable palette for color-by-country legend / edges. */
const PALETTE = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#7c3aed",
  "#047857",
  "#c2410c",
  "#0369a1",
];

export function countryColor(code: string, indexHint?: number): string {
  if (code === UNKNOWN_COUNTRY) return "#78716c";
  if (indexHint != null && indexHint >= 0) {
    return PALETTE[indexHint % PALETTE.length]!;
  }
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function buildCountryLegend(
  countries: string[],
): { code: string; color: string }[] {
  const sorted = [...new Set(countries)].sort((a, b) => {
    if (a === UNKNOWN_COUNTRY) return 1;
    if (b === UNKNOWN_COUNTRY) return -1;
    return a.localeCompare(b);
  });
  return sorted.map((code, i) => ({ code, color: countryColor(code, i) }));
}
