import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/components/ui/mermaid", () => ({
  Mermaid: ({ chart }: { chart: string }) => <div data-mermaid="">{chart}</div>,
}));

const { Markdown } = await import("./markdown");

const html = (md: string) => renderToString(<Markdown>{md}</Markdown>).replaceAll("<!-- -->", "");

describe("Markdown", () => {
  it("draws GitHub tables and task lists", () => {
    const out = html("| KPI | Now |\n|---|---|\n| Orders | 12 |\n\n- [x] done\n");
    expect(out).toContain("<table");
    expect(out).toMatch(/<th[^>]*>KPI<\/th>/);
    expect(out).toMatch(/<td[^>]*>12<\/td>/);
    expect(out).toContain('type="checkbox"');
  });

  it("hands a mermaid block to the diagram component instead of a code block", () => {
    const out = html("```mermaid\nflowchart LR\n  A --> B\n```\n");
    expect(out).toContain("data-mermaid");
    expect(out).toContain("flowchart LR");
    expect(out).not.toContain("<pre");
  });

  it("shows agents' <placeholders> and raw HTML as text, never as markup", () => {
    const out = html('Filed as <date>_crm_weekly.md\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n');
    expect(out).toContain("&lt;date&gt;_crm_weekly.md");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
  });

  it("drops javascript: links and opens web links in a new tab", () => {
    const out = html("[bad](javascript:alert(1)) and [drive](https://drive.google.com/x)\n");
    expect(out).not.toContain("javascript:");
    expect(out).toMatch(/<a href="https:\/\/drive.google.com\/x"[^>]* target="_blank" rel="noopener noreferrer"/);
  });
});
