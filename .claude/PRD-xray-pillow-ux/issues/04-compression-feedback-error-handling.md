# 04: Compression feedback and error handling in the X-ray editor — status rings, loft gauge, refused adds, save-time confirm

Tracker: #204 · Parent: #200

**Type:** AFK
**Blocked by:** 03; build after 11 so rings, gauges and messages are written once against settled geometry
**User stories:** 12, 14, 15, 16, 17, 18, 19, 20, 21
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built (PR #213) — rings, squeeze marks and the loft gauge in `xray-pillow.tsx`; `wouldFit` refusal on add; `xray-fit-banner.tsx` (banner + one confirm) and `use-pillow-fit.ts` (the host's fit, once) on all three surfaces; fit dots on the Size membership chips.

## Goal

Staff see the maximum compression of the fillings and the maximum expansion of the pillow, on the pillow, before the hold — and are told the numbers when an action would cross them.

## The gap, precisely

- `xray-pillow.tsx` `addToCell` toasts only the legacy caps (`Max 5 layers per cell`, `Max 5 pieces per layer`, `Max 25 pieces per cell`).
- No cell carries a state; the dive panel shows layer rows and the arrangement toggle, nothing about capacity.
- Loading a template (`StaffAssistPanel` → `onLoadTemplate`) and changing **Size** (`applyAssistSizeTier` clears and reloads the default) never evaluate whether the mix fits the new **Size**.
- The Configure editor renders a template at the card's **Size** only; a template with a wider **Size membership** may fit some members and not others.

## Scope

- **On the canvas** (`xray-pillow.tsx`):
  - Cell status ring: stroke the cell's own clip path (`CELL_CLIP_PATHS[key]`, inside the silhouette clip) amber for `compressed`, red for `over`. No new element class; `xray-pillow.check.ts` asserts it is a stroke on an existing region.
  - Compressed piece: dashed stroke; a `↕ 78 %` micro-label beside the type label when the piece is wide enough (reuse `PieceLabel`'s size rule); `over` piece: red tint.
- **Dive panel + phone dock:** per cell, a loft gauge (`42 / 60 mm` and a bar) and, when the status is not `ok`, the `fitMessage`. Mobile parity in the dock group of each cell.
- **Add / move refusal:** `addToCell` (and slice 06's moves) call `wouldFit`; `over` is refused with `fitMessage` in the existing toast path. `compressed` is allowed.
- **Load and Size change:** after `onLoadTemplate` and `applyAssistSizeTier`, and on the Configure and **Result** editors on load, if any cell is `over`: rings as above plus a banner under the x-ray listing the cells. Advisory.
- **Save / hold confirm:** the hold CTA (configurator, Staff assist), Save (Configure) and Save assignment (**Result**) confirm once when any cell is `over` — "Save anyway?" — never block. Same posture as the **Spatially authored** warning.
- **Shared templates:** the **Size membership** chips on the Configure editor show a fit dot per member **Size** (green / amber / red), from `fitPillow` at each size.

## Acceptance criteria

- [x] A cell at its compression limit shows an amber ring; a cell that cannot fit shows a red ring; both are strokes on the cell clip path (self-check).
- [x] The dive panel shows the loft gauge for every occupied cell of the dived **Section**; the phone dock shows the same per cell (self-check counts both mounts).
- [x] Adding a piece that would make a cell `over` is refused with a toast naming needed, fully-compressed and maximum mm; adding one that only compresses is accepted and the ring turns amber (`wouldFit` after the caps; self-check).
- [x] Loading a Size L mix into a Size XS session flags the `over` cells and shows the banner; changing **Size** back clears it. *As built:* the banner is derived from the live fit rather than fired by the load or Size-change event, so it appears whenever an `over` cell exists and clears the moment none does — the two events are the only ways an `over` cell can arise, since adds are refused.
- [x] Hold, Save and Save assignment each confirm once with an `over` cell present and proceed on confirm; they do not confirm when every cell is `ok` or `compressed` (`confirmSaveWithOverCells`; the configurator's Staff-edit save confirms too).
- [x] The **Size membership** chips carry a fit dot per size, and a recipe that fits M and not XS shows green and red respectively (`fitAtSizes`, vitest).
- [x] Rings, the gauge, `wouldFit` and the banner all evaluate the settled fit (slice 11) — they all read the one fit object — and the message names the authored cell and where it settled ("center · middle (settled into front and back)"). *Amended with slice 11:* the reachable relief is `compressed → ok`; `over` cannot flip by settling (the fully compressed floor is volume-invariant).
- [x] `xray-dive.check.ts` extended for the gauge and the refusal wiring; `surface-parity.check.ts` asserts the fit, the banner and the confirm on all three surfaces and the chip dots.
- [x] `./scripts/graphify update .` run and committed.

## Build notes (2026-09-25)

- **One fit per host.** `usePillowFit` (`components/spatial/use-pillow-fit.ts`, light: no renderer import, so the lazily loaded Configure editor keeps its chunk) computes `fitPillow` once from the same registry the frame draws with; the host hands it to `XrayPillow` (`fit` prop, which wins over the x-ray's own memo), the banner, the confirm and, in slice 05, the cross-section. The configurator computes it beside its existing memoised maps (`assistFit`, `guestFit`).
- **Piece marks.** `pieceFitStatus` reads a piece's Layer width status and its cell's thickness ratio at its depth: `compressed` draws a dashed stroke and the `↕ 78 %` / `↔ 85 %` lines through `PieceLabel`'s size rule; `over` adds a red tint on the piece's own outline. Nothing new is drawn as a rect.
- **Gauge.** `LoftGauge` is a `role="meter"`, not interactive, so it never swallows the click that adds to the cell under it. Desktop: first child of the cell panel; phone: after the dock group's header.
- **Refusal order.** `addPiece` (the schema ceilings) refuses first, then `wouldFit`; `compressed` is accepted. Moves (slice 06) go through the same two steps.
- **Confirm.** One `window.confirm` per save with the same numbers as the banner; the Result page wraps the button's click (its `assign` callback predates the fit in the hook order), the other two confirm inside their handlers.
