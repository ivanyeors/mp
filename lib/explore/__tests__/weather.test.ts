import { describe, expect, it } from "vitest";
import { coarse, rainingInSingapore } from "@/lib/explore/weather";

const NOW = new Date("2026-11-17T09:00:00+08:00");
const STATIONS = [
  { id: "W", lat: 1.34, lon: 103.7 }, // west
  { id: "C1", lat: 1.29, lon: 103.85 }, // city
  { id: "C2", lat: 1.3, lon: 103.86 },
  { id: "C3", lat: 1.31, lon: 103.84 },
  { id: "C4", lat: 1.28, lon: 103.84 },
  { id: "N", lat: 1.44, lon: 103.8 }, // north
  { id: "E1", lat: 1.35, lon: 103.98 }, // east
  { id: "E2", lat: 1.34, lon: 103.96 },
  { id: "E3", lat: 1.36, lon: 103.99 },
  { id: "E4", lat: 1.33, lon: 103.95 },
];

/** The feed's shape, with rain (mm in the last five minutes) at the named stations. */
const feed = (wet: Record<string, number>, timestamp = "2026-11-17T08:55:00+08:00") => ({
  code: 0,
  data: {
    stations: STATIONS.map((s) => ({ id: s.id, deviceId: s.id, name: s.id, location: { latitude: s.lat, longitude: s.lon } })),
    readings: [{ timestamp, data: STATIONS.map((s) => ({ stationId: s.id, value: wet[s.id] ?? 0 })) }],
    readingType: "TB1 Rainfall 5 Minute Total F",
    readingUnit: "mm",
  },
});

const CITY = { lat: 1.3, lon: 103.9 };

describe("rainingInSingapore", () => {
  it("is dry when no gauge reports rain", () => {
    expect(rainingInSingapore(feed({}), CITY, NOW)).toBe(false);
    expect(rainingInSingapore(feed({}), null, NOW)).toBe(false);
  });

  it("is raining when a gauge near the visitor reports rain", () => {
    expect(rainingInSingapore(feed({ C2: 0.2 }), CITY, NOW)).toBe(true);
  });

  it("is dry for a visitor far from the one wet gauge", () => {
    expect(rainingInSingapore(feed({ W: 1.4 }), CITY, NOW)).toBe(false);
  });

  it("is raining for everyone when a quarter of the island's gauges report rain", () => {
    const wet = { E1: 0.4, E2: 0.2, E3: 1 };
    expect(rainingInSingapore(feed(wet), null, NOW)).toBe(true);
    expect(rainingInSingapore(feed(wet), { lat: 1.34, lon: 103.7 }, NOW)).toBe(true);
  });

  it("does not guess for a visitor it cannot place, when only one gauge is wet", () => {
    expect(rainingInSingapore(feed({ C1: 2 }), null, NOW)).toBe(false);
    expect(rainingInSingapore(feed({ C1: 2 }), { lat: 51.5, lon: -0.1 }, NOW)).toBe(false);
  });

  it("does not call a reading from an hour ago rain now", () => {
    expect(rainingInSingapore(feed({ C2: 3 }, "2026-11-17T07:55:00+08:00"), CITY, NOW)).toBe(false);
  });

  it("is dry for anything it cannot read", () => {
    for (const bad of [null, undefined, "", {}, { data: {} }, { data: { stations: [], readings: [] } }, { data: { stations: "x", readings: 3 } }]) {
      expect(rainingInSingapore(bad, CITY, NOW)).toBe(false);
    }
    expect(rainingInSingapore(feed({ C2: 3 }, "not a time"), CITY, NOW)).toBe(false);
  });
});

describe("coarse", () => {
  it("rounds a coordinate to a tenth of a degree", () => {
    expect(coarse(1.28967)).toBe(1.3);
    expect(coarse(103.8501)).toBe(103.9);
  });
});
