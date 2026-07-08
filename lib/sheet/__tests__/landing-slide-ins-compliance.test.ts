import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  sheetStickyBottomClassName,
  sheetStickyTopClassName,
} from "@/lib/sheet/safe-area"

const SLIDE_INS = [
  "basic-mpillow-learn-more-slide-in.tsx",
  "premium-learn-more-dialog.tsx",
  "mbolster-learn-more-slide-in.tsx",
  "cervical-neck-support.tsx",
  "ambassadors-slide-in.tsx",
  "size-matters-slide-in.tsx",
  "book-appointment-sheet.tsx",
] as const

const slideInDir = join(process.cwd(), "components/slide-in-pages")

function readSlideIn(name: (typeof SLIDE_INS)[number]) {
  return readFileSync(join(slideInDir, name), "utf8")
}

describe("landing slide-in safe-area compliance", () => {
  it.each(SLIDE_INS)("%s uses exported sticky chrome classes", (file) => {
    const source = readSlideIn(file)
    expect(source).toContain("sheetStickyTopClassName")
    expect(source).toContain("sheetStickyBottomClassName")
  })

  it.each(SLIDE_INS)("%s has no raw sticky top-0 / bottom-0 chrome", (file) => {
    const source = readSlideIn(file)
    expect(source).not.toMatch(/sticky top-0 z-10/)
    expect(source).not.toMatch(/sticky bottom-0 z-10/)
  })

  it("framed learn-more sheets opt out of SheetContent top inset", () => {
    const framed = [
      "basic-mpillow-learn-more-slide-in.tsx",
      "premium-learn-more-dialog.tsx",
      "mbolster-learn-more-slide-in.tsx",
      "cervical-neck-support.tsx",
      "ambassadors-slide-in.tsx",
      "size-matters-slide-in.tsx",
    ] as const

    for (const file of framed) {
      const source = readSlideIn(file)
      expect(source).toContain("insetTopPadding={false}")
      expect(source).toContain('mobilePreset="full"')
    }
  })

  it("book-appointment flush sheet opts out of SheetContent top inset", () => {
    const source = readSlideIn("book-appointment-sheet.tsx")
    const insetFalseCount = (source.match(/insetTopPadding=\{false\}/g) ?? []).length
    expect(insetFalseCount).toBeGreaterThanOrEqual(2)
    expect(source).toContain("p-0 overflow-hidden")
  })

  it("sticky classes include mobile-only safe-area resets", () => {
    expect(sheetStickyTopClassName).toContain("md:pt-0")
    expect(sheetStickyBottomClassName).toContain("md:pb-0")
  })

  it("full-slidein-layout doc mandates sticky chrome exports", () => {
    const doc = readFileSync(
      join(process.cwd(), ".cursor/marketing-page/full-slidein-layout.md"),
      "utf8"
    )
    expect(doc).toContain("sheetStickyTopClassName")
    expect(doc).toContain("sheetStickyBottomClassName")
    expect(doc).toContain("insetTopPadding={false}")
    expect(doc).not.toContain("header stays flush/sticky")
  })
})

describe("quick bottom sheet non-regression", () => {
  it("select quick sheet does not set insetTopPadding", () => {
    const source = readFileSync(join(process.cwd(), "components/ui/select.tsx"), "utf8")
    expect(source).toContain('mobilePreset="quick"')
    expect(source).not.toContain("insetTopPadding")
  })
})
