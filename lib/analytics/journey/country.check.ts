/**
 * Slice 09 — Country: IP→ISO + multi-select color-by-country.
 * Run: npx tsx lib/analytics/journey/country.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCountryLegend,
  countryColor,
  normalizeCountryCode,
  resolveCountryFromHeaders,
  UNKNOWN_COUNTRY,
} from "./country";
import { buildPageTransitions } from "./transitions";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

// --- Normalize / Unknown ---
assert.equal(normalizeCountryCode("sg"), "SG");
assert.equal(normalizeCountryCode("MY"), "MY");
assert.equal(normalizeCountryCode("XX"), UNKNOWN_COUNTRY);
assert.equal(normalizeCountryCode("T1"), UNKNOWN_COUNTRY);
assert.equal(normalizeCountryCode(""), UNKNOWN_COUNTRY);
assert.equal(normalizeCountryCode(null), UNKNOWN_COUNTRY);
assert.equal(normalizeCountryCode("Singapore"), UNKNOWN_COUNTRY);

// --- Headers only (Vercel > CF); no locale ---
assert.equal(
  resolveCountryFromHeaders({ "x-vercel-ip-country": "MY" }),
  "MY",
);
assert.equal(
  resolveCountryFromHeaders({
    "cf-ipcountry": "SG",
    "x-vercel-ip-country": "ID",
  }),
  "ID",
);
assert.equal(
  resolveCountryFromHeaders({ "cf-ipcountry": "TH" }),
  "TH",
);
assert.equal(resolveCountryFromHeaders({}), UNKNOWN_COUNTRY);
assert.equal(
  resolveCountryFromHeaders(new Headers({ "x-vercel-ip-country": "jp" })),
  "JP",
);

// --- Color-by-country edges when events carry country ---
const edges = buildPageTransitions([
  { visitId: "a", path: "/", occurredAt: "2026-07-15T10:00:00.000Z", country: "SG" },
  { visitId: "a", path: "/shop", occurredAt: "2026-07-15T10:01:00.000Z", country: "SG" },
  { visitId: "b", path: "/", occurredAt: "2026-07-15T11:00:00.000Z", country: "MY" },
  { visitId: "b", path: "/shop", occurredAt: "2026-07-15T11:01:00.000Z", country: "MY" },
]).edges;
assert.ok(edges.some((e) => e.from === "/" && e.to === "/shop" && e.country === "SG"));
assert.ok(edges.some((e) => e.from === "/" && e.to === "/shop" && e.country === "MY"));

const legend = buildCountryLegend(["MY", "SG", UNKNOWN_COUNTRY]);
assert.deepEqual(
  legend.map((l) => l.code),
  ["MY", "SG", UNKNOWN_COUNTRY],
);
assert.ok(legend.every((l) => l.color.startsWith("#")));
assert.notEqual(countryColor("SG", 0), countryColor("MY", 1));

// --- Ingest route: headers → country; never locale cookie ---
const ingestRoute = readFileSync(
  join(root, "app/api/analytics/ingest/route.ts"),
  "utf8",
);
assert.match(ingestRoute, /resolveCountryFromHeaders/);
assert.match(ingestRoute, /req\.headers/);
assert.doesNotMatch(ingestRoute, /cookies\(|document\.cookie|NEXT_LOCALE/);

const countrySrc = readFileSync(join(root, "lib/analytics/journey/country.ts"), "utf8");
assert.match(countrySrc, /Never from locale cookie/);
assert.doesNotMatch(countrySrc, /cookies\(|document\.cookie|NEXT_LOCALE/);

const ingest = readFileSync(join(root, "lib/analytics/journey/ingest.ts"), "utf8");
assert.match(ingest, /country/);
assert.match(ingest, /normalizeCountryCode/);

// --- UI + actions ---
const card = readFileSync(
  join(root, "app/[lang]/settings/analytics/ProspectJourneyCard.tsx"),
  "utf8",
);
assert.match(card, /selectedCountries|countries/);
assert.match(card, /countryLegend|Country color legend/);
assert.match(card, /colorByCode/);
assert.doesNotMatch(card, /NEXT_LOCALE|document\.cookie/);

const actions = readFileSync(
  join(root, "app/[lang]/settings/analytics/actions.ts"),
  "utf8",
);
assert.match(actions, /countries/);
assert.match(actions, /countryLegend/);
// Country options come from the cached facet read (Entry sources + countries).
assert.match(actions, /readJourneyFacets/);

const aggregates = readFileSync(
  join(root, "lib/analytics/journey/aggregates.ts"),
  "utf8",
);
assert.match(aggregates, /colorByCountry|selectedCountries/);
assert.match(aggregates, /listCountriesFromDb/);

console.log("country.check.ts: ok");
