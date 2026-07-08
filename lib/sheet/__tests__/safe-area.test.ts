import { describe, expect, it } from "vitest"

import {
  resolveSheetInsetBottomPadding,
  resolveSheetInsetTopPadding,
  sheetContentTopInsetClassName,
  sheetStickyBottomClassName,
  sheetStickyTopClassName,
} from "@/lib/sheet/safe-area"

describe("resolveSheetInsetTopPadding", () => {
  it("defaults to true on mobile full preset", () => {
    expect(resolveSheetInsetTopPadding(undefined, true, "full")).toBe(true)
  })

  it("defaults to false on mobile quick preset", () => {
    expect(resolveSheetInsetTopPadding(undefined, true, "quick")).toBe(false)
  })

  it("defaults to false on desktop full preset", () => {
    expect(resolveSheetInsetTopPadding(undefined, false, "full")).toBe(false)
  })

  it("honors explicit override off", () => {
    expect(resolveSheetInsetTopPadding(false, true, "full")).toBe(false)
  })

  it("honors explicit override on", () => {
    expect(resolveSheetInsetTopPadding(true, false, "auto")).toBe(true)
  })
})

describe("resolveSheetInsetBottomPadding", () => {
  it("defaults to mobile bottom sheet", () => {
    expect(resolveSheetInsetBottomPadding(undefined, true)).toBe(true)
    expect(resolveSheetInsetBottomPadding(undefined, false)).toBe(false)
  })
})

describe("sheet sticky chrome class names", () => {
  it("top class clears safe area on mobile only", () => {
    expect(sheetStickyTopClassName).toContain("--mobile-top-clearance")
    expect(sheetStickyTopClassName).toContain("md:pt-0")
  })

  it("bottom class clears safe area on mobile only", () => {
    expect(sheetStickyBottomClassName).toContain("--safe-bottom")
    expect(sheetStickyBottomClassName).toContain("md:pb-0")
  })

  it("content top inset uses mobile top clearance token", () => {
    expect(sheetContentTopInsetClassName).toContain("--mobile-top-clearance")
  })
})
