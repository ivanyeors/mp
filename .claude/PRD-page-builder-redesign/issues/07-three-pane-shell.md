# Slice 07 — Three-pane shell: tree, live preview, inspector, device and theme toolbars

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: done
User stories covered: 29, 31–36

## What to build

The editor itself. Replace the flat accordion with three panes: a section tree on the left,
the **Preview mode** page in the centre, and the inspector on the right.

**Preview transport.** A same-origin iframe of the preview route. Shopify and Sanity build
message protocols and content-source-map encoding because their editor and site are separate
origins; there is one origin here, so selection and scrolling are direct DOM reads against
the frame. Do not add a page-builder library and do not build a message protocol.

**Selection.** Clicking a section in the preview selects it in the tree and opens its
inspector; selecting in the tree scrolls the preview to that section. Both use the section
anchor attributes the page already carries for journey analytics — slice 06 made those ids
unique, which this depends on.

**Click arbitration.** The landing page is fully interactive: tier pickers, booking buttons,
slide-in triggers and dock links are all live, so the first click on the hero would otherwise
navigate the frame away from the page being edited. Use a transparent overlay above the
iframe, toggled between *select* and *interact*, and hit-test through it. An overlay survives
the reload after every edit, which injected listeners would not, and lets **Staff** deliberately
exercise the real controls when they want to. Guard against the frame navigating away from
the landing path — the section attribute is also used on checkout, product and configurator
pages, so a stray navigation would otherwise let the picker "select" a checkout element.

**Device widths.** Phone, tablet and desktop presets. Desktop must render the frame at a real
desktop width and scale it down, not merely widen the pane: at a typical laptop size the centre
pane is narrower than the page's own content container, so an unscaled "fill" preset would just
be a third tablet width and would misrepresent the desktop layout.

**Theme.** The frame inherits the admin's own light/dark preference through same-origin storage,
so **Staff** would sign off a rendering many visitors never get. Give the toolbar an explicit
light/dark control for the preview.

**Locale.** The toolbar language switch reloads the preview at the other locale, so the pairing
with slice 03's inspector switch is visible.

**Below the large breakpoint**, fall back to the section list plus a full-screen preview sheet.
One layout, not a second inspector — and the phone still gets a preview, which is the point of
the slice. Note the app sets a fixed viewport scale, so a shrunken preview cannot be pinch-zoomed;
the full-screen sheet is what makes it usable.

Demoable outcome: **Staff** click the hero in the preview, edit its title in the inspector,
watch the preview update, switch to phone width and to Chinese, and see the change in context.

## Acceptance criteria

- [x] The page builder renders three panes above the large breakpoint: section tree, preview iframe, inspector.
- [x] Clicking a section in the preview selects it in the tree and opens its inspector.
- [x] Selecting a section in the tree scrolls the preview to it.
- [x] Hovering a section in select mode outlines it in the preview.
- [x] A select/interact toggle switches the overlay; in interact mode the page's own controls work normally.
- [x] Selection survives the preview reload that follows an edit.
- [x] If the preview navigates away from the landing path, selection is cleared rather than binding to a foreign section anchor.
- [x] Phone, tablet and desktop width presets are available; desktop renders at a real desktop width and is scaled to fit the pane.
- [x] The toolbar has an explicit light/dark control that changes the preview only, not the admin interface.
- [x] The toolbar language switch reloads the preview in the other locale.
- [x] Edits debounce into the draft and the preview refreshes without a full page navigation of the admin route.
- [x] Below the large breakpoint the builder shows the section list plus a full-screen preview sheet with a back control; there is no second inspector layout.
- [x] Drag-to-reorder still works and persists.
- [x] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local components/settings/page-builder/shell.check.ts` → `page-builder-shell self-check ok`

## Blocked by

- Slice 03 (inspector language switch)
- Slice 06 (preview route and unique section anchors)
