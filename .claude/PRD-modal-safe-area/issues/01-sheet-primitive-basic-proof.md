# Slice 01 — Sheet primitive + Basic Mpillow proof

Type: AFK
Parent: PRD `modal-safe-area` (`.claude/PRD-modal-safe-area/modal-safe-area-prd.md`)
Triage: needs-triage
User stories covered: 1, 15–17, 25–26, 33–35, 37, 40

## What to build

Land the Sheet-level safe-area contract and prove it end-to-end on one landing slide-in.

- **`insetTopPadding` on `SheetContent`:** Mirror existing `insetBottomPadding`; auto-enable when mobile + `mobilePreset="full"`; allow explicit override.
- **Top padding on `SheetContent` when enabled:** `pt-[var(--mobile-top-clearance)]` (or calc variant when outer `p-3` gutter is present on framed shells).
- **Export sticky chrome constants:**
  - `sheetStickyTopClassName` — sticky header with `pt-[var(--mobile-top-clearance)] md:pt-0`
  - `sheetStickyBottomClassName` — sticky footer with `pb-[calc(0.75rem+var(--safe-bottom))] md:pb-0`
- **Basic Mpillow learn-more:** Replace inline `sticky top-0` / `sticky bottom-0` wrappers with exported class names.
- **Unit test:** Assert `insetTopPadding` auto-logic and that exported constants include the expected CSS variable tokens and desktop resets.

After this slice, Basic Mpillow learn-more (pick-mpillow section or app dock) is demoable on a notched iPhone with title and footer CTAs clearing safe areas.

## Acceptance criteria

- [ ] `insetTopPadding` prop added; defaults to true on mobile when `mobilePreset="full"`, false for quick bottom sheets.
- [ ] `sheetStickyTopClassName` and `sheetStickyBottomClassName` exported from the Sheet module.
- [ ] Basic Mpillow learn-more sticky header and footer use exported constants (no duplicated Tailwind safe-area strings).
- [ ] Desktop (`md`+) shows no extra top/bottom safe padding on Basic Mpillow chrome.
- [ ] Automated test covers inset auto-logic and exported class string contracts.
- [ ] Bottom quick sheet (e.g. Select preset) unchanged — no unwanted top inset regression.
- [ ] No user-agent sniffing, no new dependencies.

## Blocked by

None — can start immediately.
