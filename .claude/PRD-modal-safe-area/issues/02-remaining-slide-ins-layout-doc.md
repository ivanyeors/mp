# Slice 02 — Remaining six slide-ins + layout doc

Type: AFK
Parent: PRD `modal-safe-area` (`.claude/PRD-modal-safe-area/modal-safe-area-prd.md`)
Triage: needs-triage
User stories covered: 2–14, 18–24, 27–32, 36

## What to build

Apply the Sheet sticky chrome contract to every other in-scope landing slide-in and update the agent layout template so future slide-ins do not reintroduce flush headers.

**Slide-ins to wire (import `sheetStickyTopClassName` / `sheetStickyBottomClassName`):**

1. Premium Mpillow learn-more
2. Mbolster learn-more
3. Cervical Neck Support
4. Ambassadors
5. Size Matters
6. Book Appointment — worst case (`p-0` flush sheet); apply sticky top class to `SheetHeader` and bottom safe inset on mobile dismiss bar

**Documentation:**

- Update `full-slidein-layout.md`: sticky headers must use `sheetStickyTopClassName`; mobile sticky footers use `sheetStickyBottomClassName`; remove guidance that headers stay flush to the viewport top.

No content, i18n, or inner product-section changes — shell chrome only (~1–2 lines per file).

## Acceptance criteria

- [ ] All six remaining landing slide-ins use exported sticky class names (no inline safe-area Tailwind duplication).
- [ ] Book Appointment header clears top safe area despite `p-0` flush `SheetContent`.
- [ ] Book Appointment mobile dismiss bar clears bottom safe area (`--safe-bottom`, not full dock clearance).
- [ ] Ambassadors and Size Matters mobile close bars use bottom sticky class.
- [ ] Premium, Mbolster, and Cervical footers use bottom sticky class (CTA / Back bars).
- [ ] `full-slidein-layout.md` template shows safe-area-aware sticky chrome; "flush header" guidance removed.
- [ ] Desktop layout unchanged on all six sheets.
- [ ] No changes to slide-in triggers, landing sections, or inner scroll content.

## Blocked by

- Slice 01 — Sheet primitive + Basic Mpillow proof (`.claude/PRD-modal-safe-area/issues/01-sheet-primitive-basic-proof.md`)
