import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DocArticle } from "@/components/settings/doc-article";
import { SEEDED_MILESTONES } from "@/lib/points/milestones";
import { POINTS_DEFAULTS } from "@/lib/points/settings";
import { ADMIN_GUIDES } from "../guides";
import { pointsGuideSections, pointsStatusLine } from "../points";
import type { DocSection } from "../types";

/**
 * Documentation → Mpillow Points: the guide says the programme with the live
 * numbers, and where it stands now.
 */

const text = (sections: DocSection[]) =>
  sections
    .flatMap((s) => [
      s.heading,
      ...s.blocks.flatMap((b) =>
        b.kind === "p" || b.kind === "note"
          ? [b.text]
          : b.kind === "table"
            ? [...b.head, ...b.rows.flat()]
            : b.kind === "links"
              ? b.items.map((l) => l.label)
              : b.items,
      ),
    ])
    .join("\n");

const now = new Date("2026-11-15T00:00:00Z");
const seeded = { ...POINTS_DEFAULTS, milestones: [...SEEDED_MILESTONES] };

describe("pointsStatusLine", () => {
  it("says off with no date, a launch ahead, live, and switched off after the launch", () => {
    expect(pointsStatusLine(POINTS_DEFAULTS, now)).toMatch(/^Points are off, with no launch date/);
    expect(pointsStatusLine({ ...POINTS_DEFAULTS, launchAt: "2026-12-01T00:00:00Z" }, now)).toBe(
      'Points launch on 1 December 2026 at 8:00 am, once they are turned on. Until then, customers see "Coming soon" on their Profile and nothing earns.',
    );
    expect(pointsStatusLine({ ...POINTS_DEFAULTS, enabled: true, launchAt: "2026-11-01T00:00:00Z" }, now)).toMatch(/^Points are on, since 1 November 2026/);
    expect(pointsStatusLine({ ...POINTS_DEFAULTS, launchAt: "2026-11-01T00:00:00Z" }, now)).toMatch(/^Points were switched off after their launch/);
  });
});

describe("pointsGuideSections", () => {
  it("has a unique anchor for every section", () => {
    const ids = pointsGuideSections(seeded, now).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("states the numbers the settings hold", () => {
    const t = text(pointsGuideSections({ ...seeded, earnPerDollar: 2, minRedeem: 100, maxShare: 0.3 }, now));
    expect(t).toContain("2 points per S$1");
    expect(t).toContain("20% back on products");
    expect(t).toContain("from 100 points (S$10), up to 30% of the products' price");
    expect(t).toContain("A S$89 order with no discount earns 178 points (S$17.80).");
    // One point is said as one.
    expect(text(pointsGuideSections(seeded, now))).toContain("1 point per S$1");
  });

  it("lays out each milestone with the spend that reaches it and what is back by then", () => {
    const sections = pointsGuideSections(seeded, now);
    const table = sections.find((s) => s.id === "milestones")!.blocks.find((b) => b.kind === "table");
    expect(table && table.kind === "table" ? table.rows : null).toEqual([
      ["1", "100", "10 points (S$1)", "S$100 spent", "11%"],
      ["2", "250", "30 points (S$3)", "S$250 spent", "11.6%"],
      ["3", "500", "80 points (S$8)", "S$500 spent", "12.4%"],
      ["4", "1,000", "200 points (S$20)", "S$1,000 spent", "13.2%"],
    ]);
    const t = text(sections);
    expect(t).toContain("A bonus is never taken back");
    expect(t).toContain("Milestones aren't tiers or levels.");
    expect(t).toContain("a customer who reaches the last one (1,000 points, about S$1,000 spent) has 13.2% back");
  });

  it("says when there are no milestones", () => {
    expect(text(pointsGuideSections(POINTS_DEFAULTS, now))).toContain("There are no milestones now.");
  });
});

describe("the guides", () => {
  it("each has a page, and a unique slug", () => {
    expect(new Set(ADMIN_GUIDES.map((g) => g.slug)).size).toBe(ADMIN_GUIDES.length);
    for (const g of ADMIN_GUIDES) {
      expect(existsSync(join(process.cwd(), "app/[lang]/settings/docs", g.slug, "page.tsx")), g.slug).toBe(true);
    }
  });

  it("renders a contents list of anchors, and links with the locale", () => {
    const html = renderToStaticMarkup(
      createElement(DocArticle, { sections: pointsGuideSections(seeded, now), to: (href: string) => `/en-US${href}` }),
    );
    expect(html).toContain('href="#milestones"');
    expect(html).toContain('id="milestones"');
    expect(html).toContain('href="/en-US/settings/discounts"');
    expect(html).toContain("<table");
  });
});
