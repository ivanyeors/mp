# 04: Compression feedback and error handling in the X-ray editor — status rings, loft gauge, refused adds, save-time confirm

Tracker: #204 · Parent: #200

**Type:** AFK
**Blocked by:** 03
**User stories:** 12, 14, 15, 16, 17, 18, 19, 20, 21
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

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

- [ ] A cell at its compression limit shows an amber ring; a cell that cannot fit shows a red ring; both are strokes on the cell clip path (self-check).
- [ ] The dive panel shows the loft gauge for every cell of the dived **Section**; the phone dock shows the same per cell.
- [ ] Adding a piece that would make a cell `over` is refused with a toast naming needed, fully-compressed and maximum mm; adding one that only compresses is accepted and the ring turns amber.
- [ ] Loading a Size L mix into a Size XS session flags the `over` cells and shows the banner; changing **Size** back clears it.
- [ ] Hold, Save and Save assignment each confirm once with an `over` cell present and proceed on confirm; they do not confirm when every cell is `ok` or `compressed`.
- [ ] The **Size membership** chips carry a fit dot per size, and a recipe that fits M and not XS shows green and red respectively.
- [ ] `xray-dive.check.ts` extended for the gauge and the refusal wiring; `surface-parity.check.ts` asserts the confirm on all three save paths.
- [ ] `./scripts/graphify update .` run and committed.
