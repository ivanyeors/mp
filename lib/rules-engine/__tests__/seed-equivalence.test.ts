import { describe, it, expect } from "vitest";
import { evaluateOrThrow } from "../evaluate";
import { assertPublishable } from "../validate";
import {
  basicSeedGraph,
  mbolsterSeedGraph,
  premiumSeedGraph,
} from "../seeds";
import {
  legacyBolsterLength,
  legacyShoulderSize,
} from "../recommend";

const pillowTpl = {
  XS: "1",
  S: "2",
  M: "3",
  L: "4",
  XL: "5",
};

const bolsterTpl = {
  short: "10",
  medium: "11",
  long: "12",
};

const premium = premiumSeedGraph(pillowTpl);
const basic = basicSeedGraph(pillowTpl);
const mbolster = mbolsterSeedGraph(bolsterTpl);

const SHOULDERS = [30, 36, 36.5, 40, 40.5, 46, 46.5, 52, 52.5, 60];
const HEIGHTS = [140, 149.9, 150, 170, 180, 180.5, 190];

describe("seed graphs publishable", () => {
  it("Premium / Basic / Mbolster seeds pass publish validation", () => {
    expect(assertPublishable("premium-mpillow", premium)).toEqual({ ok: true });
    expect(assertPublishable("basic-mpillow", basic)).toEqual({ ok: true });
    expect(assertPublishable("mbolster", mbolster)).toEqual({ ok: true });
  });
});

describe("seed-equivalence — Premium shoulder → size", () => {
  for (const shoulder of SHOULDERS) {
    it(`${shoulder} cm → same size as legacy in-store bands`, () => {
      const legacy = legacyShoulderSize(shoulder);
      const r = evaluateOrThrow("premium-mpillow", premium, {
        shoulder_length_cm: shoulder,
        neck_to_back_cm: 10,
        head_to_back_cm: 12,
        neck_length_cm: 10,
      });
      expect(r.size).toBe(legacy);
      expect(r.templateId).toBe(pillowTpl[legacy as keyof typeof pillowTpl]);
    });
  }
});

describe("seed-equivalence — Basic shoulder → size", () => {
  for (const shoulder of SHOULDERS) {
    it(`${shoulder} cm → same size as legacy`, () => {
      const legacy = legacyShoulderSize(shoulder);
      const r = evaluateOrThrow("basic-mpillow", basic, {
        shoulder_length_cm: shoulder,
      });
      expect(r.size).toBe(legacy);
      expect(r.templateId).toBe(pillowTpl[legacy as keyof typeof pillowTpl]);
    });
  }
});

describe("seed-equivalence — Mbolster height → length", () => {
  for (const height of HEIGHTS) {
    it(`${height} cm → same length as legacy bolster`, () => {
      const legacy = legacyBolsterLength(height);
      const r = evaluateOrThrow("mbolster", mbolster, { height_cm: height });
      expect(r.size).toBe(legacy);
      expect(r.templateId).toBe(bolsterTpl[legacy as keyof typeof bolsterTpl]);
    });
  }
});

describe("Premium seed ignores neck values for size (today's behavior)", () => {
  it("different neck trio still resolves same size + template", () => {
    const a = evaluateOrThrow("premium-mpillow", premium, {
      shoulder_length_cm: 42,
      neck_to_back_cm: 8,
      head_to_back_cm: 10,
      neck_length_cm: 9,
    });
    const b = evaluateOrThrow("premium-mpillow", premium, {
      shoulder_length_cm: 42,
      neck_to_back_cm: 14,
      head_to_back_cm: 16,
      neck_length_cm: 12,
    });
    expect(a.size).toBe("M");
    expect(b.size).toBe("M");
    expect(a.templateId).toBe(b.templateId);
  });
});
