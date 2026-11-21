import { describe, expect, it } from "vitest";
import { guessPlace, inkFor, luminance, moonPhase, moonPosition, skyAt, skyCss, skyPalette, sunPosition, toHex } from "@/lib/explore/sky";

const SINGAPORE = { lat: 1.35, lon: 103.82 };
const sgt = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 17, hour - 8, minute));

describe("sunPosition", () => {
  it("has the sun up through a Singapore day and down at night", () => {
    expect(sunPosition(sgt(6, 0), SINGAPORE).elevation).toBeLessThan(0);
    expect(sunPosition(sgt(7, 30), SINGAPORE).elevation).toBeGreaterThan(0);
    expect(sunPosition(sgt(13, 0), SINGAPORE).elevation).toBeGreaterThan(60);
    expect(sunPosition(sgt(18, 30), SINGAPORE).elevation).toBeGreaterThan(0);
    expect(sunPosition(sgt(19, 30), SINGAPORE).elevation).toBeLessThan(0);
    expect(sunPosition(sgt(1, 0), SINGAPORE).elevation).toBeLessThan(-40);
  });

  it("rises before its highest point and sets after", () => {
    expect(sunPosition(sgt(9), SINGAPORE).hourAngle).toBeLessThan(0);
    expect(sunPosition(sgt(16), SINGAPORE).hourAngle).toBeGreaterThan(0);
  });

  it("turns like a wheel: out of the sea at 180, highest at 90, into the sea at 0, lowest at 270", () => {
    const turn = (h: number, m = 0) => sunPosition(sgt(h, m), SINGAPORE).wheel;
    expect(Math.abs(turn(6, 47) - 180)).toBeLessThan(4);
    expect(Math.abs(turn(12, 50) - 90)).toBeLessThan(4);
    const set = turn(18, 51);
    expect(Math.min(set, 360 - set)).toBeLessThan(4);
    expect(Math.abs(turn(0, 50) - 270)).toBeLessThan(4);
  });

  it("never jumps: a minute moves the wheel by under a degree, all day and all night", () => {
    let before = sunPosition(sgt(0), SINGAPORE).wheel;
    for (let minute = 1; minute <= 24 * 60; minute += 1) {
      const now = sunPosition(sgt(0, minute), SINGAPORE).wheel;
      const step = Math.abs(now - before);
      expect(Math.min(step, 360 - step)).toBeLessThan(1);
      before = now;
    }
  });

  it("meets the horizon at sunrise and sunset far from the equator too", () => {
    const oslo = { lat: 59.9, lon: 10.75 };
    for (let minute = 0; minute < 24 * 60; minute += 5) {
      const sun = sunPosition(new Date(Date.UTC(2026, 11, 21, 0, minute)), oslo);
      const above = sun.wheel > 0 && sun.wheel < 180;
      if (Math.abs(sun.elevation) > 0.5) expect(above).toBe(sun.elevation > 0);
    }
  });

  it("follows the place, not the server: noon in Singapore is night in New York", () => {
    expect(sunPosition(sgt(12, 30), { lat: 40.7, lon: -74 }).elevation).toBeLessThan(0);
  });
});

describe("the moon", () => {
  it("is new on 9 December 2026 and full on 24 December 2026", () => {
    const fresh = moonPhase(new Date(Date.UTC(2026, 11, 9, 0, 52)));
    expect(Math.min(fresh, 1 - fresh)).toBeLessThan(0.04);
    expect(Math.abs(moonPhase(new Date(Date.UTC(2026, 11, 24, 1, 28))) - 0.5)).toBeLessThan(0.04);
  });

  it("is nearly all lit when full and nearly dark when new", () => {
    expect(moonPosition(new Date(Date.UTC(2026, 11, 24, 1, 28)), SINGAPORE).lit).toBeGreaterThan(0.95);
    expect(moonPosition(new Date(Date.UTC(2026, 11, 9, 0, 52)), SINGAPORE).lit).toBeLessThan(0.05);
  });

  it("a full moon is across the wheel from the sun", () => {
    const at = new Date(Date.UTC(2026, 11, 24, 14, 0));
    const apart = Math.abs(moonPosition(at, SINGAPORE).wheel - sunPosition(at, SINGAPORE).wheel);
    expect(Math.abs(Math.min(apart, 360 - apart) - 180)).toBeLessThan(25);
  });

  it("a full moon is up at midnight and down at midday", () => {
    expect(moonPosition(new Date(Date.UTC(2026, 11, 24, 16, 0)), SINGAPORE).elevation).toBeGreaterThan(30);
    expect(moonPosition(new Date(Date.UTC(2026, 11, 24, 4, 0)), SINGAPORE).elevation).toBeLessThan(0);
  });
});

describe("skyPalette", () => {
  it("is dark with stars at night and bright without them by day", () => {
    const night = skyPalette(-40, false);
    const day = skyPalette(55, false);
    expect(night.stars).toBe(1);
    expect(day.stars).toBe(0);
    expect(luminance(night.top)).toBeLessThan(0.02);
    expect(luminance(day.top)).toBeGreaterThan(0.2);
  });

  it("moves smoothly: a degree of sun changes no colour by much", () => {
    for (let e = -20; e < 45; e += 1) {
      const a = skyPalette(e, false);
      const b = skyPalette(e + 1, false);
      for (const k of ["top", "mid", "horizon", "seaDeep"] as const) {
        for (let i = 0; i < 3; i += 1) expect(Math.abs(a[k][i]! - b[k][i]!)).toBeLessThan(0.12);
      }
    }
  });

  it("dawn and dusk are different skies", () => {
    expect(toHex(skyPalette(-1.5, true).horizon)).not.toBe(toHex(skyPalette(-1.5, false).horizon));
  });

  it("rain greys the sky and hides the sun and stars, but never blacks it out", () => {
    const wetDay = skyPalette(50, false, true);
    const wetNight = skyPalette(-40, false, true);
    expect(wetDay.sunStrength).toBeLessThan(0.2);
    expect(wetNight.stars).toBeLessThan(0.1);
    const clear = skyPalette(50, false);
    expect(wetDay.top[2] - wetDay.top[0]).toBeLessThan(clear.top[2] - clear.top[0]);
    expect(luminance(wetNight.top)).toBeGreaterThan(luminance(skyPalette(-40, false).top));
  });
});

describe("inkFor", () => {
  it("is dark text on a day sky and light text at night and at dusk", () => {
    expect(inkFor(skyPalette(50, false))).toBe("dark");
    expect(inkFor(skyPalette(12, true))).toBe("dark");
    expect(inkFor(skyPalette(-30, false))).toBe("light");
    expect(inkFor(skyPalette(-3, false))).toBe("light");
    expect(inkFor(skyPalette(-30, false, true))).toBe("light");
  });
});

describe("skyAt", () => {
  it("is day at a Singapore lunchtime and night at a Singapore midnight", () => {
    expect(skyAt(sgt(12, 30), SINGAPORE).ink).toBe("dark");
    const night = skyAt(sgt(23, 30), SINGAPORE);
    expect(night.ink).toBe("light");
    expect(night.palette.stars).toBe(1);
  });

  it("carries the rain", () => {
    expect(skyAt(sgt(15), SINGAPORE, true).raining).toBe(true);
    expect(skyAt(sgt(15), SINGAPORE).raining).toBe(false);
  });
});

describe("guessPlace", () => {
  it("knows Singapore by its time zone", () => {
    expect(guessPlace("Asia/Singapore", 480)).toEqual({ lat: 1.35, lon: 103.82 });
  });

  it("puts anyone else at the longitude their clock implies", () => {
    expect(guessPlace("Europe/London", 0)).toEqual({ lat: 48, lon: 0 });
    expect(guessPlace("America/New_York", -300).lon).toBe(-75);
    expect(guessPlace("Australia/Sydney", 660).lat).toBeLessThan(0);
    expect(guessPlace(null, 540)).toEqual({ lat: 20, lon: 135 });
  });
});

describe("skyCss", () => {
  it("is a gradient from the top of the sky to the deep sea", () => {
    const p = skyPalette(50, false);
    const css = skyCss(p);
    expect(css.startsWith("linear-gradient(to bottom, ")).toBe(true);
    expect(css).toContain(toHex(p.top));
    expect(css).toContain(toHex(p.seaDeep));
  });
});
