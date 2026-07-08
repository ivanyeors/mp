# PRD: Landing Slide-In Safe-Area Fix

Status: Implemented (automated QA pass; physical device matrix pending HITL)
Source: Build plan `modal_safe_area_fix_5bf13547` (Jul 2026)

## Problem Statement

Visitors on mobile — especially iPhones with a notch or Dynamic Island — open full-screen **learn-more slide-ins** and other landing **Sheet** overlays from the homepage. Titles, progress bars, and bottom CTA/close bars sit at literal `top-0` / `bottom-0` inside portaled overlays. That chrome is drawn **under** the status bar, Dynamic Island, or home indicator.

The main app shell (home header, app dock) already respects safe-area tokens (`--safe-top`, `--mobile-top-clearance`, `--safe-bottom`). **Sheet overlays do not.** Radix portals render `position: fixed` relative to the viewport and ignore body padding — including the standalone PWA body padding that only applies in Add-to-Home-Screen mode. The bug appears in **both** browser-tab and installed-PWA display modes for the same reason.

Bottom safe-area is partially handled today (`SheetFooter`, bottom quick sheets, `OverlayDismissButton`). Top safe-area on full-screen slide-in sticky headers is missing. The worst case is the book-appointment sheet (`p-0`, flush header).

This is a layout/accessibility defect: users cannot reliably read modal titles or tap bottom actions on modern mobile devices.

## Solution

From the visitor's perspective, every landing slide-in opens the same way and shows the same content — but headers, titles, and bottom bars always clear the notch/Dynamic Island and home indicator. Desktop layout is unchanged (no extra top/bottom padding at `md` breakpoint).

From the developer's perspective:

1. Extend the existing **Sheet primitive** with a symmetric top-inset rule (mirroring `insetBottomPadding`) and export shared **sticky chrome class names** for slide-in headers and footers.
2. Apply those classes across **all seven landing slide-in components** so safe-area handling is consistent and not copy-pasted.
3. Update the **full slide-in layout** agent template so future slide-ins default to safe-area-aware sticky chrome.
4. Verify manually on Safari iOS and Chrome Android in both browser-tab and Add-to-Home-Screen modes.

No JavaScript device detection, no new dependencies, no changes to `viewport-fit` (already correct).

## User Stories

1. As a visitor on an iPhone with Dynamic Island, I want the Basic Mpillow learn-more title to appear below the island, so that I can read the sheet heading without obstruction.
2. As a visitor on an iPhone with Dynamic Island, I want the Premium Mpillow learn-more title to appear below the island, so that I understand which product story I opened.
3. As a visitor on an iPhone with Dynamic Island, I want the Mbolster learn-more title to appear below the island, so that I can scan the bolster story from the top.
4. As a visitor on an iPhone with Dynamic Island, I want the Cervical Neck Support learn-more title to appear below the island, so that the accessory story is readable.
5. As a visitor on an iPhone with Dynamic Island, I want the Ambassadors slide-in title to appear below the island, so that I can read who represents the brand.
6. As a visitor on an iPhone with Dynamic Island, I want the Size Matters slide-in title to appear below the island, so that sizing guidance is not hidden.
7. As a visitor on an iPhone with Dynamic Island, I want the Book Appointment sheet header to appear below the island, so that I know I am booking an appointment.
8. As a visitor on any iPhone with a notch (non-island), I want the same seven slide-ins to clear the notch in portrait and landscape, so that rotation does not hide titles.
9. As a visitor who added the site to my home screen (iOS standalone), I want slide-in titles still cleared below the status bar, so that PWA mode does not regress — body padding alone must not be assumed sufficient.
10. As a visitor using Safari in a normal browser tab, I want slide-in titles cleared below the island/notch, so that the bug is fixed even when body standalone padding is off.
11. As a visitor using Chrome on iOS (WebKit), I want the same safe-area behavior as Safari, so that I am not blocked on my preferred browser.
12. As a visitor on Android with a display cutout (Pixel, some Samsung), I want slide-in titles cleared below the cutout when the browser reports a top inset, so that cutout devices are supported.
13. As a visitor on Android without a display cutout, I want slide-ins to look the same as today (zero extra top gap), so that harmless `env(safe-area-inset-top)` usage does not add phantom padding.
14. As a visitor on Android using an installed PWA (standalone), I want full-screen sheets to respect safe areas without the Chrome address bar, so that installed-app users get correct chrome.
15. As a visitor scrolling a learn-more slide-in, I want the sticky header (title + progress bar) to remain below the safe top inset while content scrolls underneath, so that progress and title stay visible and unobstructed.
16. As a visitor on mobile, I want bottom CTA bars and mobile close buttons to sit above the home indicator, so that I can tap Customise, Book appointment, or Close without mis-taps.
17. As a visitor on the Basic Mpillow learn-more slide-in, I want footer CTAs above the home indicator, so that my path to customise or book is tappable.
18. As a visitor on the Premium Mpillow learn-more slide-in, I want footer CTAs above the home indicator, so that premium conversion actions remain reachable.
19. As a visitor on the Mbolster learn-more slide-in, I want footer CTAs above the home indicator, so that purchase actions are not clipped.
20. As a visitor on the Cervical Neck Support slide-in, I want the Back/Close footer above the home indicator, so that nested navigation works on small screens.
21. As a visitor on the Ambassadors slide-in, I want the mobile close bar above the home indicator, so that I can dismiss the sheet easily.
22. As a visitor on the Size Matters slide-in, I want the mobile close bar above the home indicator, so that I can exit after reading sizing content.
23. As a visitor on the Book Appointment sheet, I want the mobile dismiss bar above the home indicator, so that I can close the iframe flow without the button sitting in the gesture area.
24. As a visitor on desktop (`md` and up), I want no extra safe-area padding on slide-in headers or footers, so that large-screen layout is unchanged.
25. As a visitor opening slide-ins from the app dock menu, I want the same safe-area fix as when opening from landing sections, so that entry point does not matter.
26. As a visitor opening Basic/Premium learn-more from the pick-mpillow section, I want correct safe areas, so that primary product CTAs work.
27. As a visitor opening Mbolster learn-more from the product card section, I want correct safe areas, so that bolster discovery is not broken on mobile.
28. As a visitor opening Cervical Neck Support from the neck-pains section CTA, I want correct safe areas, so that the landing funnel is consistent.
29. As a visitor opening Ambassadors or Size Matters from text-image sections, I want correct safe areas, so that editorial slide-ins are usable.
30. As a visitor opening Book Appointment from the hero section or any `openBookAppointmentSheet()` trigger, I want the flush iframe sheet to respect top and bottom insets, so that the worst-case layout is fixed.
31. As a visitor using a bottom quick sheet (e.g. Select preset), I want behavior unchanged — no unwanted extra top padding on quick sheets, so that existing bottom-sheet UX is not regressed.
32. As a visitor scrolling in Safari tab mode with a collapsing URL bar, I want `100dvh` full sheets to remain stable relative to device cutouts, so that browser chrome collapse does not reintroduce the island overlap (device safe area vs browser chrome are separate concerns).
33. As a developer, I want one Sheet-level contract for top inset (`insetTopPadding`) auto-enabled for `mobilePreset="full"`, so that new full sheets get correct defaults.
34. As a developer, I want exported `sheetStickyTopClassName` and `sheetStickyBottomClassName` constants, so that the seven slide-ins do not duplicate Tailwind strings.
35. As a developer, I want framed slide-ins (`p-3` gutter + inner `100dvh` panel) to pad the **sticky header wrapper** (not only `SheetContent`), so that flex layout and scroll regions stay intact.
36. As a developer, I want the full-slide-in layout template updated to mandate safe-top on sticky headers, so that agents do not reintroduce flush `sticky top-0` patterns.
37. As a developer, I must not add user-agent sniffing or Dynamic Island detection in JavaScript, so that the fix stays maintainable and platform-correct.
38. As a developer, I must not rely on `@media (display-mode: standalone)` body padding to fix sheets, so that we do not ship a red-herring fix for portaled overlays.
39. As a developer, I must not subtract standalone body padding from sheet insets, so that PWA users are not under-padded.
40. As a developer, I want a single source of truth for sticky chrome classes (exported constants **or** CSS utilities, not both), so that drift is avoided.
41. As a QA tester, I want a documented device matrix (Safari iOS tab + A2HS, Chrome Android tab + installed PWA) covering all seven slide-ins, so that release sign-off is repeatable.
42. As a product owner, I want pillow customizer and mobile sidebar sheets addressed in a follow-up if not trivial, so that primary landing conversion paths are fixed first without blocking the release.

## Implementation Decisions

### Scope boundary

**In scope (primary):**

- Sheet primitive: `insetTopPadding` prop, auto-enable for `mobilePreset="full"`; export `sheetStickyTopClassName` and `sheetStickyBottomClassName`.
- Seven landing slide-in sheets:
  - Basic Mpillow learn-more
  - Premium Mpillow learn-more
  - Mbolster learn-more
  - Cervical Neck Support
  - Ambassadors
  - Size Matters
  - Book Appointment
- Agent layout template update for full slide-in pattern (safe-top on sticky headers, safe-bottom on mobile sticky footers).

**Out of scope (primary PRD — optional follow-up):**

- Pillow customizer mobile sheet
- Mobile sidebar sheet
- Centered Dialog modals (lower risk unless near full height)
- Apple cards carousel fullscreen overlay
- Bubble menu hardcoded `padding-top: 120px`
- Tuning `--mobile-top-offset` per `display-mode: standalone`

### Root cause (architectural)

| Layer | Current behavior | Required change |
|-------|------------------|-----------------|
| CSS tokens | `--safe-top`, `--safe-bottom`, `--mobile-top-clearance` defined in global stylesheet | Reuse in sheet sticky chrome |
| Main shell | Home header and app dock use clearance tokens | No change |
| Sheet primitive | `insetBottomPadding` for mobile bottom sheets; no top symmetric rule | Add `insetTopPadding`; auto for `mobilePreset="full"` |
| Full slide-ins | Inner `sticky top-0` / `sticky bottom-0` without safe tokens | Apply shared sticky class names |
| Book appointment | `p-0` flush sheet; header at viewport top | Apply sticky top class and bottom safe inset on dismiss bar |
| PWA body padding | Helps in-flow content only in standalone | Must not be treated as modal fix |

### Modules to build or modify

| Module | Type | Responsibility |
|--------|------|----------------|
| **Sheet primitive** | Deep module (extend) | `insetTopPadding` mirrors `insetBottomPadding`; applies `pt-[var(--mobile-top-clearance)]` on `SheetContent` when enabled; for framed gutters, calc variant `pt-[calc(0.75rem+var(--safe-top))]` when outer `p-3` present; exports `sheetStickyTopClassName` / `sheetStickyBottomClassName` |
| **Sticky chrome contract** | Deep module (new surface on Sheet) | Single Tailwind contract: top = `sticky top-0 z-10 border-b bg-background/80 backdrop-blur pt-[var(--mobile-top-clearance)] md:pt-0`; bottom = `sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 pb-[calc(0.75rem+var(--safe-bottom))] md:pb-0` |
| **Landing slide-in shells** | Shallow consumers (7 files) | Replace duplicated sticky wrapper classes with exported constants; book-appointment gets explicit treatment for `p-0` flush layout |
| **Full slide-in layout doc** | Documentation | Update template: sticky headers must use safe-top; remove guidance that headers stay "flush" to viewport top |

### Technical decisions

1. **Platform API:** Use `env(safe-area-inset-top/bottom)` via existing CSS variables only. `viewport-fit: cover` is already set — no change.
2. **No JS split for PWA vs browser:** Insets are correct per mode from the platform; do not detect display mode in React.
3. **Pad sticky wrapper, not only SheetContent:** Framed pattern uses `100dvh` inner panel with sticky header inside; padding the sticky wrapper preserves flex scroll layout.
4. **Auto top inset only for `mobilePreset="full"`:** Bottom quick sheets keep drag handle at top; avoid extra top padding unless explicitly requested.
5. **Desktop reset:** `md:pt-0` / `md:pb-0` on sticky chrome so desktop is unaffected.
6. **Bottom inset on slide-in footers:** Use `--safe-bottom` only for modal footers, not full `--mobile-bottom-clearance` (dock clearance is for persistent dock, not ephemeral sheet CTAs).
7. **Single source of truth:** Prefer exported constants from Sheet module over duplicate CSS utility classes in globals.

### Two problems (do not conflate)

1. **Device cutouts** (notch, island, home indicator) → solved by safe-area insets on sticky chrome.
2. **Browser UI chrome** (URL bar, tab bar) → already mitigated by `100dvh` and dock clearance; separate from this fix.

### Expected diff size

~15–25 lines in Sheet primitive, ~1–2 lines per landing slide-in (7 files), one documentation update. No new dependencies.

## Testing Decisions

### What makes a good test

- Test **observable layout contracts** (class names / props applied under mobile + full preset), not pixel-perfect rendering.
- Do not test `env(safe-area-inset-*)` values in JSDOM — they are always `0px` in unit tests.
- Prefer one small module-level check over per-slide-in duplication.

### Modules to test

| Module | Test? | Rationale |
|--------|-------|-----------|
| Sheet primitive (`insetTopPadding`, exported class names) | **Recommended** | Deep module; single place wrong = all slide-ins wrong |
| Individual slide-in files | **No unit tests** | Thin consumers; manual device QA is the acceptance gate |
| Full slide-in layout doc | **No automated test** | Human/agent conformance |

### Proposed unit check (if approved)

- Assert `shouldInsetTopPadding` logic: `insetTopPadding` explicit override, auto-true when mobile + `mobilePreset="full"`, false for quick bottom sheets.
- Assert exported `sheetStickyTopClassName` / `sheetStickyBottomClassName` contain `--mobile-top-clearance` and `--safe-bottom` respectively and `md:pt-0` / `md:pb-0`.

Prior art: product slide sections PRD includes a small renderer/config resolution test; same "one deep module" pattern applies here.

### Manual QA (required for acceptance)

Matrix: Safari iOS (tab + Add to Home Screen) × Chrome Android (tab + installed PWA).

Per slide-in checklist (all seven): title visible below cutout; bottom CTA/close above home indicator; desktop no extra gap; bottom quick sheet (Select) no regression.

Device spot-checks: iPhone 15/16 Pro (island), older notch iPhone, Android with/without cutout, landscape rotation on iOS.

Tools: Safari Web Inspector safe-area overlay; Chrome DevTools device mode where available.

## Out of Scope

- JavaScript detection of iPhone model, Dynamic Island, or front camera
- `react-native-safe-area-context` or resize listeners for cutout presence
- Changes to `viewport-fit`, manifest, or `appleWebApp` meta (already correct)
- Fixing pillow customizer, mobile sidebar, dialog, carousel, or bubble menu in this PRD (documented follow-ups)
- Content, copy, i18n, or inner product-section template changes inside learn-more slide-ins
- Landing page section markup changes (triggers stay the same)

## Further Notes

### Relationship to Product Slide-In Sections PRD

The product slide sections work refactors **inner content** while preserving slide-in **shell chrome**. This PRD fixes shell chrome safe-area — complementary, not conflicting. When both land, slide-ins should use exported sticky classes in the shell.

### Ponytail constraints

- Fix once at the Sheet primitive; slide-ins only import constants.
- No parallel CSS utility layer if constants are exported.
- `ponytail:` comment acceptable on book-appointment iframe dismiss pattern (already present).

### Agent template correction

The current full-slidein-layout guidance ("header stays flush/sticky") caused the bug. Updated template should show `sheetStickyTopClassName` on the sticky header wrapper and `sheetStickyBottomClassName` on mobile footer bars.

### Publish note

Local draft for review. After approval: publish to issue tracker with `needs-triage`, then break into vertical slices via `/to-issues`.
