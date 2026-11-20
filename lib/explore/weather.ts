import type { Place } from "./sky";

export const RAINFALL_URL = "https://api-open.data.gov.sg/v2/real-time/api/rainfall";

const FRESH_MS = 30 * 60_000;
const ISLAND_SHARE = 0.25;
const NEAREST = 4;

const inSingapore = (p: Place) => p.lat > 1.15 && p.lat < 1.48 && p.lon > 103.59 && p.lon < 104.1;

type Station = { id: string; lat: number; lon: number };

function read(payload: unknown): { stations: Station[]; values: Map<string, number>; at: number } | null {
  const data = (payload as { data?: unknown } | null)?.data as
    | { stations?: unknown; readings?: unknown }
    | undefined;
  if (!data || !Array.isArray(data.stations) || !Array.isArray(data.readings)) return null;
  const reading = data.readings[0] as { timestamp?: unknown; data?: unknown } | undefined;
  if (!reading || !Array.isArray(reading.data)) return null;
  const at = Date.parse(String(reading.timestamp ?? ""));
  if (!Number.isFinite(at)) return null;
  const values = new Map<string, number>();
  for (const r of reading.data as { stationId?: unknown; value?: unknown }[]) {
    const v = Number(r?.value);
    if (typeof r?.stationId === "string" && Number.isFinite(v)) values.set(r.stationId, v);
  }
  const stations: Station[] = [];
  for (const s of data.stations as { id?: unknown; location?: { latitude?: unknown; longitude?: unknown } }[]) {
    const lat = Number(s?.location?.latitude);
    const lon = Number(s?.location?.longitude);
    if (typeof s?.id === "string" && Number.isFinite(lat) && Number.isFinite(lon) && values.has(s.id)) {
      stations.push({ id: s.id, lat, lon });
    }
  }
  return stations.length ? { stations, values, at } : null;
}

export function rainingInSingapore(payload: unknown, place: Place | null, now: Date = new Date()): boolean {
  const r = read(payload);
  if (!r) return false;
  if (now.getTime() - r.at > FRESH_MS) return false;
  const wet = (s: Station) => (r.values.get(s.id) ?? 0) > 0;
  if (r.stations.filter(wet).length / r.stations.length >= ISLAND_SHARE) return true;
  if (!place || !inSingapore(place)) return false;
  const d2 = (s: Station) => (s.lat - place.lat) ** 2 + (s.lon - place.lon) ** 2;
  return [...r.stations].sort((a, b) => d2(a) - d2(b)).slice(0, NEAREST).some(wet);
}

export function coarse(n: number): number {
  return Math.round(n * 10) / 10;
}
