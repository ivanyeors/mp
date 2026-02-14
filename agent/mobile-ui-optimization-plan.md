# Mobile UI and Interaction Optimization Plan

## Objective

Deliver a mobile experience that feels native, avoids clashes with browser/system UI, and makes all critical actions reachable with one hand. This plan is scoped to the current app architecture (`AppDock`, `Sheet`, mobile `Select`, settings sidebar shell) and is designed for phased delivery.

## Current State (from codebase)

- Global shell uses a fixed bottom dock (`components/app-dock.tsx`) with safe-area offset.
- `Sheet` auto-converts side drawers to bottom sheets on mobile unless `disableMobileBottom` is set (`components/ui/sheet.tsx`).
- Several long-form "learn more" experiences already use full-height right drawers with sticky header/footer.
- Mobile `Select` already switches from dropdown to bottom sheet (`components/ui/select.tsx`).
- Settings uses sidebar on desktop and mobile sheet on small screens (`components/ui/sidebar.tsx` + `app/settings/layout.tsx`).
- Safe-area handling exists but is not fully standardized across all fixed/sticky UI (`app/globals.css`, `components/home-header.tsx`, `components/app-dock.tsx`, `components/top-loading-bar.tsx`).

---

## Product Outcomes

1. **No native UI collisions**: fixed/sticky top and bottom elements never overlap status bars, browser bars, or gesture bars.
2. **Consistent drawer behavior**: each drawer type follows a predictable interaction model.
3. **Faster mobile completion**: less accidental dismissal, fewer double-scroll traps, faster navigation and form completion.
4. **Accessible touch ergonomics**: controls remain readable and tappable (44x44 minimum target).

---

## UX Principles

1. **Thumb-first actions**: primary actions near bottom, but above safe-area + dock.
2. **One overlay at a time**: avoid stacking competing sheets/dialogs where possible.
3. **Progressive disclosure**: quick tasks in bottom sheets; deep tasks in full-page drawers.
4. **Motion with purpose**: transitions communicate hierarchy, not decoration.
5. **Resilient to dynamic viewport changes**: keyboard, collapsed/expanded browser bars, orientation shifts.

---

## Drawer Pattern Matrix (Different Cases)

### Case A: Quick actions / global navigation (slide-up drawer)

**Examples:** AppDock menu on mobile  
**Pattern:** bottom sheet, medium height, scannable action tiles

- Open from bottom with visible grab handle.
- Initial height target: ~65-75svh.
- Keep top of sheet below `safe-area-top` if expanded to near-full.
- Sticky internal title row only if content exceeds one screen.
- Dismiss on swipe-down, overlay tap, close button, Android back.
- Close immediately when route action is chosen.

### Case B: Option picking (slide-up drawer)

**Examples:** mobile `Select` content  
**Pattern:** bottom sheet, list-based selector

- Height target: content-driven up to ~70svh.
- List is single scroll surface (no nested scrolling).
- Selected state visually persistent.
- Close on select by default (`closeOnSelect=true`), with override for multi-select scenarios.
- Include keyboard-safe mode when search input is introduced.

### Case C: Long-form education/content (full-page drawer)

**Examples:** Basic/Premium/Mbolster/Ambassadors/Size Matters sheets  
**Pattern:** full-height page-like drawer (right on desktop, full-screen behavior on mobile)

- Keep `disableMobileBottom` for immersive content flows.
- Use `100dvh` shell with sticky header and optional sticky footer CTA.
- Preserve scroll position per sheet instance while open.
- Avoid double progress indicators (one global + one local).
- Ensure CTA/footer is above safe-area inset and never under dock.

### Case D: Task-oriented forms/editors (full-page drawer)

**Examples:** inventory/settings right-side edit sheets  
**Pattern:** full-page task panel on mobile

- Treat as temporary "subpage" with clear title and explicit close.
- If form is dirty, show discard confirmation on close/swipe/back.
- Action bar pinned to bottom with safe-area padding.
- Support keyboard-aware layout so inputs and submit actions stay visible.

### Case E: External embedded experiences

**Examples:** appointment iframe sheet  
**Pattern:** full-height drawer with stable chrome

- Sticky header with close.
- Iframe occupies remaining height (`flex-1`).
- Prevent parent scroll behind iframe.
- Fallback path if iframe fails: open in new tab with clear message.

### Case F: Sidebar-as-sheet (admin mobile nav)

**Examples:** settings sidebar on mobile  
**Pattern:** edge sheet (left/right) behaving like navigation drawer

- Full-height nav sheet with clear close behavior.
- Keep hit targets >=44px.
- Preserve active route context and close immediately on navigation.

---

## Top and Bottom Spacing Strategy (Prevent Native UI Clashes)

Create one spacing contract and enforce it across all fixed/sticky mobile UI.

### 1) Standardize CSS variables in `app/globals.css`

Add/normalize shared tokens:

- `--safe-top: env(safe-area-inset-top, 0px)`
- `--safe-bottom: env(safe-area-inset-bottom, 0px)`
- `--mobile-dock-height` (actual dock visual height)
- `--mobile-dock-offset` (dock bottom offset)
- `--mobile-bottom-clearance` = dock + safe-bottom + breathing room
- `--mobile-top-clearance` = safe-top + header offset

### 2) Top anchored elements

For fixed top UI (compact header, loading bar, floating actions):

- Use `top: calc(var(--safe-top) + 4px to 8px)` consistently.
- Avoid hard-coded top magic numbers spread per component.
- Ensure z-index ladder is explicit:
  - content < sticky headers < dock < sheets/dialog overlays.

### 3) Bottom anchored elements

For dock, sticky CTA bars, bottom sheets:

- Dock bottom should remain `safe-bottom` aware (already partially done).
- Sticky CTA/footer inside drawers should use:
  - `padding-bottom: calc(16px + var(--safe-bottom))`
- Page wrappers should include route-aware bottom clearance:
  - with dock visible: reserve `--mobile-bottom-clearance`
  - with dock hidden: reserve only safe-bottom baseline.

### 4) Browser mode differences

Handle both:

- Normal browser mode (dynamic browser bars)
- PWA standalone/fullscreen mode

Always prefer `dvh/svh` units for full-height panels and avoid plain `100vh` on mobile.

---

## Interaction and Gesture Rules

1. **Swipe-to-close thresholds**
   - Close only after clear intent threshold (distance + velocity), not minor scroll movement.
2. **Scroll containment**
   - Drawer body owns scrolling; prevent background page scroll while open.
3. **Back button behavior**
   - Android back closes topmost drawer first, then navigates history.
4. **Overlay taps**
   - Allowed for low-risk sheets; blocked/confirmed for dirty forms.
5. **Nested overlays**
   - Avoid opening sheet-on-sheet. Prefer replacing or queueing flows.

---

## Accessibility and Mobile Ergonomics

- Minimum 44x44 tap targets for controls and list rows.
- Proper labels for close actions and drawer titles.
- Focus trap and focus return to trigger on close.
- Respect reduced motion (`prefers-reduced-motion`) for drawer animations.
- Maintain contrast for translucent surfaces over media backgrounds.

---

## Performance and Stability

- Lazy-mount heavy drawer content (media-heavy long forms) only on open.
- Preload critical sheet content on intent (`touchstart`/first hover where relevant).
- Keep animations transform/opacity-based, avoid layout-thrashing properties.
- Use `overscroll-contain` for scroll regions to reduce accidental page bounce.
- Profile low-end mobile for dropped frames during open/close transitions.

---

## File-Level Implementation Roadmap

## Phase 0 - Audit and instrumentation (0.5-1 day)

- Track:
  - drawer open rate,
  - dismissal without action,
  - action completion from drawer,
  - accidental close/reopen patterns.
- Add lightweight event taxonomy for each drawer type.

## Phase 1 - Shared spacing contract (1 day)

**Primary files:**
- `app/globals.css`
- `components/app-dock.tsx`
- `components/home-header.tsx`
- `components/top-loading-bar.tsx`

**Deliverables:**
- Unified safe-area variables and z-index layering.
- Centralized top/bottom clearance utilities.
- Removal of duplicated ad-hoc safe-area formulas where possible.

## Phase 2 - Shared sheet behavior hardening (1-2 days)

**Primary file:**
- `components/ui/sheet.tsx`

**Deliverables:**
- Explicit mobile sheet behavior presets (quick sheet vs full-page sheet).
- Optional drag handle slot for bottom sheets.
- Standardized safe bottom padding support for sticky footers.
- Consistent dismiss/backdrop semantics by sheet type.

## Phase 3 - Case-by-case rollout (2-4 days)

### 3A. Global menu drawer
- `components/app-dock.tsx`
- Improve hierarchy, spacing, and snap-height behavior for quick access.

### 3B. Mobile select drawer
- `components/ui/select.tsx`
- Ensure long-option lists remain performant and keyboard-safe.

### 3C. Long-form learn-more drawers
- `components/basic-mpillow-learn-more-slide-in.tsx`
- `components/premium-learn-more-dialog.tsx`
- `components/mbolster-learn-more-slide-in.tsx`
- `components/ambassadors-slide-in.tsx`
- `components/size-matters-slide-in.tsx`

- Normalize sticky header/footer spacing against safe-area and dock.
- Ensure one consistent close affordance and action area behavior.

### 3D. Task/edit drawers
- `app/settings/inventory/page.tsx`
- `app/settings/inventory/configure/page.tsx`
- `app/settings/costings/page.tsx`
- Add dirty-state dismissal guard + keyboard-safe action bars.

### 3E. Sidebar mobile sheet
- `components/ui/sidebar.tsx`
- Improve mobile nav hit areas and close-on-navigation reliability.

## Phase 4 - QA and regression hardening (1-2 days)

Device/browser matrix:

- iOS Safari (recent iPhone, with address bar expanded/collapsed)
- Android Chrome (gesture navigation and 3-button mode)
- PWA standalone on iOS/Android
- Small viewport (e.g. iPhone SE class)
- Landscape orientation checks

Test scenarios:

- Open/close via tap, swipe, back button.
- Keyboard open with focused input inside sheets.
- Route changes from sheet actions.
- Long content scroll + sticky footer visibility.
- Reduced-motion mode.

## Phase 5 - Measure and iterate (ongoing, weekly)

- Compare baseline vs post-rollout:
  - drawer conversion to intended action,
  - drop-off at first interaction,
  - median time to complete key flows,
  - support complaints related to mobile navigation/layout overlap.

---

## Acceptance Criteria

1. No fixed/sticky UI overlaps system/browser chrome in tested devices.
2. All mobile drawers follow one of the approved case patterns (A-F).
3. No double-scroll trap in any drawer flow.
4. Primary actions inside drawers remain visible above safe-area and keyboard.
5. Accessibility checks pass for focus, labels, and target sizes.
6. No major animation jank during open/close on mid-tier mobile devices.

---

## Risks and Mitigations

- **Risk:** inconsistent per-page overrides reintroduce clashes  
  **Mitigation:** enforce shared CSS tokens + reusable drawer presets.

- **Risk:** complex sheets become too heavy on first open  
  **Mitigation:** lazy-mount heavy sections and defer non-critical media.

- **Risk:** accidental dismiss on scroll gestures  
  **Mitigation:** stricter swipe-close thresholds and dirty-state protections.

- **Risk:** dock/CTA collisions in uncommon route states  
  **Mitigation:** route-scoped bottom clearance tests in QA matrix.

---

## Suggested Priority Order

1. Safe-area spacing contract (top/bottom)  
2. Shared sheet behavior presets  
3. Global menu + mobile select drawer polish  
4. Long-form content drawer consistency  
5. Form/task drawer safeguards and keyboard handling  
6. QA matrix and metrics review

