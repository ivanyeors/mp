import { describe, expect, it } from "vitest";
import { detectReport, parseCsv, parseReport, parseReportDate, siteMismatchWarning } from "@/lib/seo-metrics/csv-import";

// Shapes and sample rows from real exports (2026-10-02).
const GSC_CHART = "Date,Impressions\n2026-07-09,0\n2026-07-10,1\n2026-07-11,4\n";
const GSC_PAGES =
  "Top pages,Impressions\nhttps://custom.mpillow.com/en-US/blog/unlocking-better-sleep-the-benefits-of-a-frequency-bed,6\nhttps://custom.mpillow.com/en-US/blog/bolster-pillow-vs-regular-pillow-which-offers-better-support,3\n";
const GSC_DEVICES = "Device,Impressions\nMobile,17\nDesktop,14"; // no trailing newline, as exported
const GSC_FILTERS = "Filter,Value\nSearch type,Web\nDate,Last 3 months\n";
const BING =
  '﻿"Date","Citations","Cited Pages"\r\n"4/2/2026 12:00:00 AM","1","1"\r\n"4/9/2026 12:00:00 AM","4","2"\r\n"4/29/2026 12:00:00 AM","16","1"\r\n';

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, a BOM and blank lines", () => {
    expect(parseCsv('﻿"a","b ""x"", y"\r\n\r\n1,2')).toEqual([
      ["a", 'b "x", y'],
      ["1", "2"],
    ]);
  });
});

describe("detectReport", () => {
  it("recognises each export by its header", () => {
    expect(detectReport(["Date", "Impressions"])).toBe("gsc_genai_chart");
    expect(detectReport(["Top pages", "Impressions"])).toBe("gsc_genai_pages");
    expect(detectReport(["Date", "Citations", "Cited Pages"])).toBe("bing_ai_daily");
    expect(detectReport(["Query", "Clicks"])).toBeNull();
  });
});

describe("parseReportDate", () => {
  it("reads ISO and Bing's US month/day format, and rejects impossible dates", () => {
    expect(parseReportDate("2026-07-10")).toBe("2026-07-10");
    expect(parseReportDate("4/2/2026 12:00:00 AM")).toBe("2026-04-02");
    expect(parseReportDate("12/31/2026 12:00:00 AM")).toBe("2026-12-31");
    expect(parseReportDate("2/30/2026 12:00:00 AM")).toBeNull();
    expect(parseReportDate("yesterday")).toBeNull();
  });
});

describe("parseReport", () => {
  const opts = { importDate: "2026-10-02", period: "Last 3 months" };

  it("maps the Google chart to daily gsc_genai totals", () => {
    const r = parseReport(GSC_CHART, opts);
    expect(r).toMatchObject({ ok: true, kind: "gsc_genai_chart", skipped: 0 });
    if (!r.ok) return;
    expect(r.rows[1]).toEqual({
      date: "2026-07-10", source: "gsc_genai", dimension: "total", key: "", clicks: 0, impressions: 1, position_sum: 0,
    });
  });

  it("maps Bing citations to bing_ai totals with cited pages in extra", () => {
    const r = parseReport(BING, opts);
    expect(r.ok && r.rows.map((x) => [x.date, x.impressions, x.extra])).toEqual([
      ["2026-04-02", 1, { cited_pages: 1 }],
      ["2026-04-09", 4, { cited_pages: 2 }],
      ["2026-04-29", 16, { cited_pages: 1 }],
    ]);
  });

  it("stores page and device totals as period snapshots on the import date", () => {
    const pages = parseReport(GSC_PAGES, opts);
    expect(pages.ok && pages.rows[0]).toMatchObject({
      date: "2026-10-02",
      dimension: "page_period",
      key: "https://custom.mpillow.com/en-US/blog/unlocking-better-sleep-the-benefits-of-a-frequency-bed",
      impressions: 6,
      extra: { period: "Last 3 months" },
    });
    const devices = parseReport(GSC_DEVICES, opts);
    expect(devices.ok && devices.rows.map((x) => [x.key, x.impressions])).toEqual([["Mobile", 17], ["Desktop", 14]]);
  });

  it("merges a repeated key within one file instead of failing the save", () => {
    const r = parseReport("Top pages,Impressions\nhttps://x/a,2\nhttps://x/a,3\n", opts);
    expect(r.ok && r.rows.map((x) => [x.key, x.impressions])).toEqual([["https://x/a", 5]]);
  });

  it("reads the period label from Filters.csv", () => {
    expect(parseReport(GSC_FILTERS, opts)).toMatchObject({ ok: true, kind: "gsc_genai_filters", period: "Last 3 months", rows: [] });
  });

  it("skips malformed rows and rejects unknown files with a clear message", () => {
    expect(parseReport("Date,Impressions\nnot-a-date,3\n2026-07-10,abc\n2026-07-11,2\n", opts)).toMatchObject({ ok: true, skipped: 2 });
    const bad = parseReport("Query,Clicks\nx,1\n", opts);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("Generative AI");
  });
});

describe("siteMismatchWarning", () => {
  it("flags a Bing export for another host and ignores files without a host", () => {
    expect(siteMismatchWarning("www.mpillow.com_AIPerformanceOverviewStats_10_2_2026.csv", "custom.mpillow.com")).toContain("www.mpillow.com");
    expect(siteMismatchWarning("custom.mpillow.com_AIPerformanceOverviewStats_10_2_2026.csv", "custom.mpillow.com")).toBeNull();
    expect(siteMismatchWarning("Chart.csv", "custom.mpillow.com")).toBeNull();
  });
});
