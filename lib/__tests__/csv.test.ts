import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv } from "@/lib/csv";
import { parseCsv as seoParseCsv } from "@/lib/seo-metrics/csv-import";

describe("lib/csv", () => {
  it("is the parser the SEO import re-exports", () => {
    expect(seoParseCsv).toBe(parseCsv);
  });

  it("strips a BOM and reads quoted cells, escaped quotes and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });

  it("quotes only the cells that need it", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  it("writes what it reads", () => {
    const rows = [["1", "Ana, Lim", 'the "best"', "line\nbreak"]];
    expect(parseCsv(toCsv(["n", "name", "quote", "note"], rows))).toEqual([["n", "name", "quote", "note"], ...rows]);
  });
});
