import { describe, expect, it } from "vitest";
import { fromDocsMarkdown, parseLongDate, parseOutputName, parseReport, reportTone, withoutHeader } from "./report";

const DOCS_EXPORT = String.raw`\# Code & dependency audit (sec-code) · Week to 18 Nov 2026

Status: Degraded

Headline: Review blocked: no repo access, so 14 merged PRs are unreviewed.



\#\# Numbers (max 5)

| KPI | Now | Before | Target | Status | Source |

| Secrets found (open) | 0 in client bundle | none (first run) | 0 | amber (partial coverage) | bundle scan |

| Findings past SLA | 0 | none | 0 | green | sec-code\_findings.csv |



\#\# Decisions for Ivan (max 3)

\- sec-code-2026-11-1: Give this agent read access? | Options: A / B | Recommend: A | Why: payments ship unreviewed | Impact: SGD 0 cost | Reversible: yes | Decide by: 25 Nov 2026 | Draft: none

\#\# Drafts awaiting approval

\- doc — 2026-11-18\_sec-code\_draft\_fixes — https://docs.google.com/document/d/abc/edit

\#\# OKR progress

| KR id | Key result | Current | Target | Status |

| sec-code-1 | Secrets found in the repo | repo not scanned | 0 | Not measured |

\#\# Alerts

\- medium — SC-002: confirm checkout still fires its event. Test before launch. — deadline: 18 Dec 2026

\- medium — 0 of 14 commits reviewed this week. — deadline: none

\#\# Data gaps

\- GitHub: no add\_repo tool in this run.
`;

const MARKDOWN = `# CRM & Customer success · Week to 24 Nov 2026

Status: No material change

Headline: 38 fit checks are 8+ days overdue.

## Numbers (max 5)

| KPI | Now | Before | Target | Status | Source |
|---|---|---|---|---|---|
| Fit checks overdue 7+ days | 38 | 34 | 0 | red | Supabase |

## Findings (max 3)

None

## Decisions for Ivan (max 3)

None

## Drafts awaiting approval

- doc — templates — [2026-11-24_crm_draft_templates.md](https://drive.google.com/file/d/x)

## OKR progress

| KR id | Key result | Current | Target | Status |
|---|---|---|---|---|
| crm-1 | Post-fitting follow-ups done within 30 days | 0% | 100% | Off track |

## Backlog

| Item | KR id | Score | Now/Next/Later | Runs in Now |
|---|---|---|---|---|

## Alerts

None

## Data gaps

- GA4 is not connected.

\`\`\`mermaid
flowchart LR
  A[Booked] --> B[Fitted]
\`\`\`
`;

describe("parseOutputName", () => {
  it("reads reports, drafts and other files, including hyphenated ids", () => {
    expect(parseOutputName("2026-11-18_sec-code_weekly")).toEqual({ date: "2026-11-18", agent: "sec-code", kind: "weekly", slug: null, ext: null });
    expect(parseOutputName("2026-11-24_crm_draft_segment-counts.md")).toEqual({ date: "2026-11-24", agent: "crm", kind: "draft", slug: "segment-counts", ext: "md" });
    expect(parseOutputName("2026-11-07_fin_stripe-2026-10.csv")).toEqual({ date: "2026-11-07", agent: "fin", kind: "file", slug: "stripe-2026-10", ext: "csv" });
    expect(parseOutputName("2026-12-08_ceo_monthly.md")?.kind).toBe("monthly");
  });

  it("rejects names that do not follow the filing pattern", () => {
    expect(parseOutputName("00 Agent Manual")).toBeNull();
    expect(parseOutputName("crm_weekly.md")).toBeNull();
    expect(parseOutputName("2026-11-24_CRM_weekly.md")).toBeNull();
  });
});

describe("fromDocsMarkdown", () => {
  it("turns a Google Doc holding Markdown text back into Markdown with real tables", () => {
    const md = fromDocsMarkdown(DOCS_EXPORT);
    expect(md).toContain("# Code & dependency audit");
    expect(md).toContain("## Numbers (max 5)");
    expect(md).toContain("- sec-code-2026-11-1:");
    expect(md).toContain("sec-code_findings.csv");
    expect(md).toMatch(/\| KPI \| Now \| Before \| Target \| Status \| Source \|\n\| --- \| --- \| --- \| --- \| --- \| --- \|\n\| Secrets found/);
    expect(md).not.toMatch(/\|\n\n\|/);
  });

  it("leaves a table that already has its separator alone", () => {
    expect(fromDocsMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n")).toBe("| a | b |\n|---|---|\n| 1 | 2 |\n");
  });
});

describe("parseReport", () => {
  it("reads every section of a report exported from a Google Doc", () => {
    const r = parseReport(fromDocsMarkdown(DOCS_EXPORT));
    expect(r.title).toBe("Code & dependency audit (sec-code) · Week to 18 Nov 2026");
    expect(r.status).toBe("Degraded");
    expect(r.tone).toBe("degraded");
    expect(r.headline).toMatch(/^Review blocked/);
    expect(r.numbers.map((n) => [n.kpi, n.rag])).toEqual([["Secrets found (open)", "amber"], ["Findings past SLA", "green"]]);
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions[0]).toMatchObject({ id: "sec-code-2026-11-1", question: "Give this agent read access?", decideBy: "2026-11-25" });
    expect(r.decisions[0].fields.recommend).toBe("A");
    expect(r.okrs).toEqual([{ id: "sec-code-1", text: "Secrets found in the repo", current: "repo not scanned", target: "0", status: "Not measured" }]);
    expect(r.alerts).toEqual([
      { severity: "medium", text: "SC-002: confirm checkout still fires its event. Test before launch.", deadline: "18 Dec 2026" },
      { severity: "medium", text: "0 of 14 commits reviewed this week.", deadline: null },
    ]);
    expect(r.drafts).toHaveLength(1);
    expect(r.dataGaps).toEqual(["GitHub: no add_repo tool in this run."]);
  });

  it("reads a Markdown report and treats None as empty", () => {
    const r = parseReport(MARKDOWN);
    expect(r.tone).toBe("unchanged");
    expect(r.numbers[0]).toMatchObject({ kpi: "Fit checks overdue 7+ days", now: "38", rag: "red" });
    expect(r.findings).toEqual([]);
    expect(r.decisions).toEqual([]);
    expect(r.alerts).toEqual([]);
    expect(r.okrs[0]).toMatchObject({ id: "crm-1", status: "Off track" });
  });

  it("does not invent fields from a file that is not a report", () => {
    const r = parseReport("# Ad copy draft\n\nHeadlines and keywords.\n\n| Keyword | Intent |\n|---|---|\n| custom pillow | buy |\n");
    expect(r).toMatchObject({ status: null, tone: "unknown", headline: null, numbers: [], okrs: [], decisions: [] });
  });
});

describe("small readers", () => {
  it("maps statuses written by agents to a tone", () => {
    expect(reportTone("OK")).toBe("ok");
    expect(reportTone("Succeeded")).toBe("ok");
    expect(reportTone("Partial")).toBe("degraded");
    expect(reportTone("Failed")).toBe("failed");
    expect(reportTone("Looking good")).toBe("unknown");
  });

  it("reads the dates agents write", () => {
    expect(parseLongDate("25 Nov 2026")).toBe("2026-11-25");
    expect(parseLongDate("by 2 December 2026")).toBe("2026-12-02");
    expect(parseLongDate("2027-01-10")).toBe("2027-01-10");
    expect(parseLongDate("none")).toBeNull();
    expect(parseLongDate("31 Foo 2026")).toBeNull();
  });
});

describe("withoutHeader", () => {
  it("drops the title, Status and Headline lines the page shows above the report, and nothing else", () => {
    const body = withoutHeader(MARKDOWN);
    expect(body.startsWith("## Numbers (max 5)")).toBe(true);
    expect(body).not.toContain("Status: No material change");
    expect(body).toContain("| Fit checks overdue 7+ days | 38 |");
  });

  it("keeps a Status line that sits inside a section", () => {
    expect(withoutHeader("# T\n\n## Notes\n\nStatus: draft\n")).toBe("## Notes\n\nStatus: draft\n");
  });
});

