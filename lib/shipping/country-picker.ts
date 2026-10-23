import { COUNTRIES, countryName, REGIONS } from "@/lib/shipping/countries";

/**
 * How a country picker lists the Delivery countries: the home market first,
 * then the rest of Southeast Asia in the catalog's order, then everywhere else
 * A–Z. A search keeps that order and drops what does not match. Pure, so the
 * picker and its tests read the same list.
 */

export const HOME_COUNTRY = "SG";

export interface CountryGroup {
  /** Null for the home market, which needs no heading. */
  label: string | null;
  codes: string[];
}

const SEA_LABEL = REGIONS.find((r) => r.key === "southeast_asia")!.label;

/** Southeast Asia in the catalog's order, nearest and busiest lanes first. */
const SEA_ORDER = COUNTRIES.filter((c) => c.region === "southeast_asia").map((c) => c.code);

/** A country's place in Southeast Asia; -1 outside it. */
function seaRank(code: string): number {
  return SEA_ORDER.indexOf(code);
}

/** What people type for a country that its catalog name does not contain. */
const ALIASES: Record<string, string[]> = {
  US: ["usa", "america", "united states of america"],
  GB: ["uk", "britain", "great britain", "england", "scotland", "wales"],
  AE: ["uae", "dubai", "abu dhabi"],
  KR: ["korea"],
  NL: ["holland"],
  CZ: ["czech republic"],
  MM: ["burma"],
  TL: ["east timor"],
  VN: ["viet nam"],
};

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Whether a country answers a search: its name, its code, or a common other name. */
export function countryMatches(code: string, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  if (code.toLowerCase() === q) return true;
  if (fold(countryName(code)).includes(q)) return true;
  return (ALIASES[code] ?? []).some((alias) => alias.includes(q));
}

/** The picker's sections, searched. Empty sections are left out. */
export function groupCountries(codes: string[], query = "", home = HOME_COUNTRY): CountryGroup[] {
  const matching = [...new Set(codes.map((c) => c.toUpperCase()))].filter((c) => countryMatches(c, query));
  const homeGroup = matching.filter((c) => c === home);
  const sea = matching
    .filter((c) => c !== home && seaRank(c) >= 0)
    .sort((a, b) => seaRank(a) - seaRank(b));
  const rest = matching
    .filter((c) => c !== home && seaRank(c) < 0)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return [
    { label: null, codes: homeGroup },
    { label: SEA_LABEL, codes: sea },
    { label: "Rest of the world", codes: rest },
  ].filter((g) => g.codes.length > 0);
}

/** The country's flag as an emoji (two regional indicator letters); empty for a malformed code. */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
