/**
 * Assert the email palette against app/globals.css.
 *
 * Email clients understand neither oklch nor CSS variables, so theme.ts carries
 * literal hexes. Nothing checked them against the source, and a wrong
 * `DARK.primary` shipped unnoticed — this converts the oklch values out of
 * globals.css and compares.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK, LIGHT, RADIUS } from "../theme";

const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** oklch(L C H) → #rrggbb, for the sRGB gamut. */
function oklchToHex(L: number, C: number, Hdeg: number): string {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  // Oklab → LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  // LMS → linear sRGB
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toSrgb = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  return `#${[lr, lg, lb]
    .map(toSrgb)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Read a custom property out of the `:root` or `.dark` block. */
function readToken(block: ":root" | ".dark", name: string): string {
  const start = globalsCss.indexOf(`${block} {`);
  expect(start, `${block} block not found in globals.css`).toBeGreaterThan(-1);
  const body = globalsCss.slice(start, globalsCss.indexOf("\n}", start));
  const match = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  expect(match, `--${name} not found in ${block}`).not.toBeNull();
  return match![1].trim();
}

function tokenHex(block: ":root" | ".dark", name: string): string {
  const raw = readToken(block, name);
  const m = raw.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  expect(m, `--${name} in ${block} is not a plain oklch(): ${raw}`).not.toBeNull();
  return oklchToHex(Number(m![1]), Number(m![2]), Number(m![3]));
}

describe("oklchToHex", () => {
  it("converts the neutral ramp to Tailwind's own hexes", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0.985, 0, 0)).toBe("#fafafa");
    expect(oklchToHex(0.97, 0, 0)).toBe("#f5f5f5");
    expect(oklchToHex(0.922, 0, 0)).toBe("#e5e5e5");
    expect(oklchToHex(0.708, 0, 0)).toBe("#a1a1a1");
    expect(oklchToHex(0.556, 0, 0)).toBe("#737373");
    expect(oklchToHex(0.269, 0, 0)).toBe("#262626"); // neutral-800
    expect(oklchToHex(0.205, 0, 0)).toBe("#171717"); // neutral-900
    expect(oklchToHex(0.145, 0, 0)).toBe("#0a0a0a"); // neutral-950
  });
});

describe("email palette matches globals.css", () => {
  it.each([
    ["card", "background", LIGHT.card],
    ["fg", "foreground", LIGHT.fg],
    ["mutedBg", "muted", LIGHT.mutedBg],
    ["mutedFg", "muted-foreground", LIGHT.mutedFg],
    ["border", "border", LIGHT.border],
    ["primary", "primary", LIGHT.primary],
    ["primaryFg", "primary-foreground", LIGHT.primaryFg],
  ])("LIGHT.%s === :root --%s", (_key, token, value) => {
    expect(value).toBe(tokenHex(":root", token));
  });

  it.each([
    ["page", "background", DARK.page],
    ["card", "card", DARK.card],
    ["fg", "foreground", DARK.fg],
    ["mutedBg", "muted", DARK.mutedBg],
    ["mutedFg", "muted-foreground", DARK.mutedFg],
    ["primary", "primary", DARK.primary],
    ["primaryFg", "primary-foreground", DARK.primaryFg],
  ])("DARK.%s === .dark --%s", (_key, token, value) => {
    expect(value).toBe(tokenHex(".dark", token));
  });

  it("documents the two deliberate departures", () => {
    // LIGHT.page: an email needs the page behind the card to differ from it.
    expect(tokenHex(":root", "background")).toBe("#ffffff");
    expect(LIGHT.page).toBe("#fafafa");
    // DARK.border: the site value is rgba, which Outlook mishandles on borders.
    expect(readToken(".dark", "border")).toContain("/");
    expect(DARK.border).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("email radii match the site scale", () => {
  it("derives from --radius: 0.625rem", () => {
    expect(readToken(":root", "radius")).toBe("0.625rem");
    const base = 10;
    expect(RADIUS.sm).toBe(base - 4);
    expect(RADIUS.md).toBe(base - 2);
    expect(RADIUS.lg).toBe(base);
    expect(RADIUS.xl).toBe(base + 4);
    // --radius-button is calc(--radius-md * 2)
    expect(RADIUS.button).toBe((base - 2) * 2);
  });
});
