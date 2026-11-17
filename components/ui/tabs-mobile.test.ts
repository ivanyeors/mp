/**
 * Tab strips must never stack onto a second row and never side-scroll inline.
 *
 * Both failure modes look the same on a phone: triggers half-cut at the
 * container edge, with the overflowing ones unreachable. `TabsList` collapses
 * an over-wide row into a single menu button instead, so these asserts pin the
 * two places that can reintroduce the bug — the primitive itself, and a call
 * site that overrides the primitive's guards.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SEARCH_DIRS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".claude"]);

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsx(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const tabs = read("components/ui/tabs.tsx");

describe("components/ui/tabs.tsx", () => {
  it("keeps the row on one line whatever a call site passes", () => {
    // The guard string is concatenated after `className` inside cn(), so
    // tailwind-merge lets it win over a caller's flex-wrap / overflow-x-auto.
    expect(tabs).toMatch(/TABS_LIST_ROW_GUARD\s*=\s*"[^"]*flex-nowrap[^"]*"/);
    expect(tabs).toMatch(/TABS_LIST_ROW_GUARD\s*=\s*"[^"]*overflow-hidden[^"]*"/);
    expect(tabs).toMatch(/cn\(\s*TABS_LIST_ROW\[variant\],\s*className,\s*TABS_LIST_ROW_GUARD/);
  });

  it("never turns the strip into a horizontal scroller", () => {
    expect(tabs).not.toMatch(/overflow-x-auto|overflow-x-scroll/);
  });

  it("collapses an over-wide row into a menu button", () => {
    expect(tabs).toMatch(/data-slot="tabs-list-summary"/);
    expect(tabs).toMatch(/scrollWidth\s*-\s*\w+\.clientWidth\s*>\s*1/);
    expect(tabs).toMatch(/TABS_LIST_MENU/);
  });

  it("aligns with the container gutter instead of bleeding past it", () => {
    // The old fix was a `-m-1` scroll wrapper, which pulled the strip 4px
    // outside the page gutter and then clipped the first trigger against it.
    expect(tabs).not.toMatch(/-m-1|-mx-1/);
    expect(tabs).toMatch(/data-slot="tabs-list-container"[\s\S]*?relative w-full min-w-0/);
  });

  it("keeps the mobile touch baseline on both shapes", () => {
    const rowAndSummary = tabs.match(/h-9[^"]*max-md:h-11/g) ?? [];
    expect(rowAndSummary.length).toBeGreaterThanOrEqual(2);
  });
});

// The underline look is a variant, not call-site overrides: overrides lose to
// the default trigger's `dark:` active styles, which is how the product page's
// Description tab became a filled box in dark mode.
describe('TabsList variant="line"', () => {
  const lineOf = (constName: string) =>
    tabs.match(
      new RegExp(`const ${constName}: Record<TabsVariant, string> = \\{[\\s\\S]*?line:\\s*"([^"]*)"`)
    )?.[1] ?? "";
  const row = lineOf("TABS_LIST_ROW");
  const summary = lineOf("TABS_LIST_SUMMARY");
  const trigger = lineOf("TABS_TRIGGER");

  it("has its own strings for the row, the collapsed button and the trigger", () => {
    expect(row).not.toBe("");
    expect(summary).not.toBe("");
    expect(trigger).not.toBe("");
    expect(tabs).toMatch(/cn\(TABS_TRIGGER\[variant\], className\)/);
  });

  it("has a larger size for page-level sections, which keeps the row's guards", () => {
    // PRD-customer-page-journey slice 01: 48px, 16px semibold, a 3px underline.
    expect(tabs).toMatch(/TABS_LIST_ROW_LG\s*=\s*"[^"]*h-12[^"]*"/);
    expect(tabs).toMatch(/TABS_TRIGGER_LG\s*=\s*\n?\s*"[^"]*text-base font-semibold[^"]*after:h-\[3px\][^"]*"/);
    // The size rides in on `className`, ahead of the guard, and only for `line`.
    expect(tabs).toMatch(/const large = variant === "line" && size === "lg"/);
    expect(tabs).not.toMatch(/TABS_(LIST_ROW|TRIGGER|LIST_SUMMARY)_LG\s*=\s*\n?\s*"[^"]*(flex-wrap|overflow-x-auto|bg-muted|shadow-sm)/);
  });

  it("never fills, boxes or shadows the active tab", () => {
    for (const src of [row, summary, trigger]) {
      expect(src).not.toMatch(/bg-muted|bg-background|bg-input|border-input|shadow-sm|rounded-lg|\bp-1\b/);
    }
    expect(trigger).toMatch(/data-\[state=active\]:text-foreground/);
    expect(trigger).toMatch(/after:bottom-0 after:h-0\.5/);
    expect(trigger).toMatch(/data-\[state=active\]:after:bg-primary/);
  });

  it("shows keyboard focus inside the clipped row", () => {
    expect(trigger).toMatch(/focus-visible:ring-\[3px\] focus-visible:ring-inset/);
    expect(summary).toMatch(/focus-visible:ring-\[3px\] focus-visible:ring-inset/);
  });

  it("is a 44px target on a phone, row and collapsed button alike", () => {
    expect(row).toMatch(/max-md:h-11/);
    expect(row).toMatch(/items-stretch/);
    expect(summary).toMatch(/max-md:h-11/);
  });

  it("still collapses, and an open menu uses the default rows", () => {
    expect(tabs).toMatch(/TABS_LIST_SUMMARY\[variant\]/);
    expect(tabs).toMatch(/value=\{showAsMenu \? "default" : variant\}/);
  });
});

describe("TabsList call sites", () => {
  const offenders: string[] = [];

  for (const dir of SEARCH_DIRS) {
    for (const file of collectTsx(join(ROOT, dir))) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/<TabsList\b[^>]*>/g)) {
        if (/flex-wrap|overflow-x-auto|overflow-x-scroll/.test(match[0])) {
          offenders.push(`${relative(ROOT, file)}: ${match[0]}`);
        }
      }
    }
  }

  it("never ask the strip to wrap or to scroll sideways", () => {
    expect(offenders).toEqual([]);
  });

  const handRolled: string[] = [];
  for (const dir of SEARCH_DIRS) {
    for (const file of collectTsx(join(ROOT, dir))) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/<TabsTrigger\b[^>]*>/g)) {
        if (/border-b-2|data-\[state=active\]:border-primary/.test(match[0])) {
          handRolled.push(`${relative(ROOT, file)}: ${match[0]}`);
        }
      }
    }
  }

  it('use variant="line" instead of hand-rolling an underline', () => {
    expect(handRolled).toEqual([]);
  });
});
