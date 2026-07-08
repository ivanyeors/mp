export type SheetMobilePreset = "auto" | "quick" | "full"

export const sheetStickyTopClassName =
  "sticky top-0 z-10 border-b bg-background/80 backdrop-blur pt-[var(--mobile-top-clearance)] md:pt-0"

export const sheetStickyBottomClassName =
  "sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 pb-[calc(0.75rem+var(--safe-bottom))] md:pb-0"

export const sheetContentTopInsetClassName = "pt-[var(--mobile-top-clearance)]"

export function resolveSheetInsetTopPadding(
  insetTopPadding: boolean | undefined,
  isMobile: boolean,
  mobilePreset: SheetMobilePreset
): boolean {
  return insetTopPadding ?? (isMobile && mobilePreset === "full")
}

export function resolveSheetInsetBottomPadding(
  insetBottomPadding: boolean | undefined,
  isMobileBottomSheet: boolean
): boolean {
  return insetBottomPadding ?? isMobileBottomSheet
}
