process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import { renderEmailShell } from "../base";
import { button } from "../components";
import { DARK, LIGHT } from "../theme";

const LIGHT_INK = new Set([LIGHT.primaryFg.toLowerCase(), DARK.primary.toLowerCase()]);

function sanitize(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/background(-color)?:[^;"]*;?/g, "")
    .replace(/\sclass="[^"]*"/g, "");
}

function unbackedLightInk(html: string): string[] {
  const stripped = sanitize(html);
  const found: string[] = [];
  for (const m of stripped.matchAll(/<a\b[^>]*color:(#[0-9a-f]{6})[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!LIGHT_INK.has(m[1].toLowerCase())) continue;
    const before = stripped.slice(0, m.index);
    const tdStart = before.lastIndexOf("<td");
    const tag = tdStart === -1 ? "" : before.slice(tdStart, before.indexOf(">", tdStart) + 1);
    if (!tag.includes("bgcolor=")) found.push(m[2].replace(/<[^>]+>/g, "").trim());
  }
  return found;
}

describe("survives a CSS-stripping sanitizer", () => {
  it.each(EMAIL_REGISTRY.map((c) => [c.id, c] as const))("%s", (id, entry) => {
    const orphans = unbackedLightInk(entry.render("happy").html);
    expect(orphans, `${id}: light ink with no bgcolor fill — ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("button()", () => {
  const html = button({ href: "https://custom.mpillow.com/x", label: "Do the thing" });

  it("carries the fill as an attribute and in both CSS forms", () => {
    expect(html).toContain(`bgcolor="${LIGHT.primary}"`);
    expect(html).toContain(`background:${LIGHT.primary}`);
    expect(html).toContain(`background-color:${LIGHT.primary}`);
  });

  it("keeps the Outlook branch on the VML fillcolor attribute", () => {
    expect(html).toContain(`fillcolor="${LIGHT.primary}"`);
  });

  it("puts the ink on the anchor and the fill on the cell, not both on one node", () => {
    const anchor = html.slice(html.indexOf("<a "), html.indexOf("</a>"));
    expect(anchor).toContain(`color:${LIGHT.primaryFg}`);
    expect(anchor).not.toContain("background");
  });

  it("still degrades a rejected URL to plain text", () => {
    const dead = button({ href: "javascript:alert(1)", label: "Nope" });
    expect(dead).not.toContain("bgcolor");
    expect(dead).toContain("Nope");
  });
});

describe("dark mode flips fill and ink together", () => {
  const style = renderEmailShell({ bodyHtml: "" });

  it.each([
    ["media query", (sel: string) => `      ${sel} {`],
    ["[data-ogsc]", (sel: string) => `    [data-ogsc] ${sel} {`],
  ])("paints .mp-btn-cell wherever it paints .mp-btn (%s)", (_label, fmt) => {
    expect(style).toContain(fmt(".mp-btn-cell"));
    expect(style).toContain(fmt(".mp-btn"));
    expect(style).toContain(fmt(".mp-btn-cell-secondary"));
    expect(style).toContain(fmt(".mp-btn-secondary"));
  });

  it("gives the button cell the dark fill and the anchor the matching ink", () => {
    expect(style).toContain(`.mp-btn-cell { background: ${DARK.primary} !important; }`);
    expect(style).toContain(`.mp-btn { color: ${DARK.primaryFg} !important; }`);
  });

  it("stretches the fill table with the anchor on small screens", () => {
    expect(style).toContain(".mp-btn-table { width: 100% !important; }");
    expect(style).toContain(".mp-btn { display: block !important; }");
  });
});
