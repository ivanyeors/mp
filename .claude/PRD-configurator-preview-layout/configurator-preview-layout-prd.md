# PRD: Configurator preview layout

Status: Shipped (verified in a local harness; awaiting a deployed-build check on a real tablet and phone)
Source: Audit of the `/mp-config` preview step ("Your Custom Mpillow") from a Staff
screenshot, reproduced in a local harness at 1680×1050, 1366×768, 820×1180 and
390×844, dark and light (Oct 2026)

## Problem Statement

The preview step is two jobs on one screen: the shopper's finish-and-pay page, and
the **Staff assist mode** filling editor. It grew one slice at a time — x-ray,
fit banner, cross-section, toolbox, pack list, reveal — onto a stage that was laid
out for a single pillow picture, and it no longer holds them.

What the audit found, with the cause of each:

1. **The stage clips what it cannot fit, and nothing can scroll to it.** The left
   column is a fixed-height `overflow-hidden` flex column, centred vertically. In
   Staff mode it holds about 1,240 px of content in a 994 px box, so roughly 120 px
   is cut off the top *and* the bottom. That is the pillow top under the header in
   the screenshot, the toolbox sliced in half, and a **Derived pack list** nobody can
   reach on desktop. At 1366×768 the top-down x-ray is clipped out entirely.
2. **Staff copy renders at marketing size.** `[data-typography-scope="marketing"] p`
   forces every `<p>` on a public route to 16/18 px `!important`. The configurator is
   a public route, so the fit banner, the cross-section readout and the phone hint
   ("Tap a section to edit") get 18 px over a 16 px `leading-4`. The lines overlap,
   and on phones the hint runs into the fit banner. The same rule makes cover and
   case names 18 px while add-on names next to them stay 14 px.
3. **Light mode is broken on the stage.** The stage is meant to be dark in both
   themes (`xray-theme.ts`), but it paints `bg-background`. In light mode the
   white-text tier pill is blank, the reveal card washes out, the fit banner is
   white on pink, and the cut's Front / Middle / Back labels and readout vanish.
4. **Editing works differently here than in Settings.** Configure → Filling
   Template docks the dived Section's controls in a "Section editor" column beside
   the x-ray (`controlsSlot`), and puts the pack list in its own card. The
   configurator parks the same controls on the pillow cells at 9 px, and glues the
   pack list under a floating toolbox at the bottom of the stage. Staff learn two
   layouts for one **X-ray editor**.
5. **The hierarchy is upside down for Staff.** Size, Tier and Filling Template —
   the context the x-ray is drawn in — sit at the very bottom, under the
   cross-section and the recommendation card.
6. **The toolbox truncates its own values** ("Premi…", "FILLING…"). Each chip has a
   fixed 7.5 rem basis inside a `w-fit` rail.

The questionnaire steps were checked at the same sizes. They are in good shape
(PRD-configurator-mobile-ux), and this PRD does not change them.

## Solution

**One scrollable stage, never clipped.** On desktop the stage column keeps its
sticky full-height box, but its content scrolls inside it. The content is centred
only while it fits (`my-auto`), so it never overflows upward out of reach. The
starfield stays fixed behind it.

**The stage is dark in both themes.** It carries the `dark` class, so the theme
tokens and every `dark:` variant inside it resolve dark. That matches what the
x-ray theme already documents, and the existing white-on-dark art direction
becomes true in light mode too.

**The preview is an app surface, not marketing copy.** Its root carries
`data-typography-scope="app"`, and the marketing `p` / `h2` overrides skip
anything inside it. The questionnaire keeps marketing typography.

**Staff get the Settings workbench.** It uses the same pieces and arrangement as
Configure → Filling Template:

- On wide screens (xl), a **Section editor** column on the left of the x-ray takes
  the dived Section's controls through `controlsSlot`. It shows "Click a section on
  the x-ray to edit its fillings." until a Section is dived. It is one shared
  component (`XraySectionDock`) used by both surfaces, so they cannot drift.
- On tablets (md–xl), the same panel docks directly under the x-ray while a Section
  is dived.
- On phones, nothing changes. `XrayPillow` keeps its own dock under the pillow
  (`slotted` is desktop-only by design).
- The Staff toolbar (Size · Tier · Filling Template · sync status · save) moves to
  the top of the stage. Its chips size to their content instead of truncating.
- The **Derived pack list** leaves the toolbox and becomes its own card under the
  cross-section. It is always present for Staff, with "No pieces placed yet." when
  empty, as in Settings.
- Order for Staff: toolbar → x-ray → (tablet dock) → fit banner → cross-section →
  pack list → recommendation context → selected add-ons.

**Shoppers keep the reveal story.** Pillow → read-only cut → tier →
recommendation → selected add-ons. The only changes are no clipping, correct
typography, and a stage that reads in light mode.

## Implementation Decisions

- No new state. The pack list reads the same lifted `assistPlacements` /
  `assistItems` the x-ray reads. `StaffAssistPanel` stops rendering it.
- `controlsSlot` is chosen per breakpoint, as Settings does with `wideWorkbench`:
  - the side dock at xl;
  - the inline dock at md–xl;
  - phones ignore it inside `XrayPillow`.
- Every check-asserted pattern in `mp-config-client.tsx` is preserved. That covers
  the single `<XrayPillow`, `{xrayVisible && (`, the `staffAssist && size && tier ?
  (<StaffAssistPanel` ternary, the `<XrayCrossSection` prop order, and the footer
  `border-t bg-background px-5 py-4 … configuratorMobileCloseClearanceClassName …
  holdCta` order.
- Mobile chrome is unchanged (PRD-configurator-mobile-ux): no effects below md, the
  bottom Close bar, no top-right X.

## Out of Scope

- The finish panel's content and order (cover/case pickers, add-ons, contact,
  shipping, CTA). Those belong to PRD-configurator-mobile-ux. Only their typography
  changes, through the scope fix.
- The questionnaire steps, `/mp-basic` copy and `/mbolster-config`. The bolster
  stage has its own capsule editor.
- Insert order in the configurator. It stays on Result detail assign, as today.

## Acceptance criteria

- [x] At 1680×1050, 1366×768 and 1024×768, no stage content is clipped, and every
  Staff control (toolbar, x-ray, banner, cut, pack list) is reachable by scrolling
  the stage.
- [x] Clicking a Section at xl puts its controls in the left Section editor column,
  and the pillow keeps only its hover hint. At md–xl they appear under the x-ray.
  On phones the dock is unchanged.
- [x] The fit banner, cut readout and phone hint render at their own sizes (11–14
  px), with no overlapping lines.
- [x] In light mode the stage is dark. Tier pill, reveal, banner and cut labels are
  legible.
- [x] The toolbox shows "Premium" and "Filling Template" untruncated at 1366 px.
- [x] Settings → Configure renders the same `XraySectionDock` with unchanged markup.
- [ ] All existing `.check.ts` / vitest suites pass.
