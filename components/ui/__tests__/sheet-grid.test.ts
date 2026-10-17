import { describe, expect, it } from "vitest";

import { parseClipboardGrid } from "../sheet-grid";

describe("parseClipboardGrid", () => {
  it("splits a Sheets range into rows and cells, dropping the trailing newline and CRs", () => {
    expect(parseClipboardGrid("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
  });
  it("keeps empty cells", () => {
    expect(parseClipboardGrid("1\t\t3")).toEqual([["1", "", "3"]]);
  });
});
