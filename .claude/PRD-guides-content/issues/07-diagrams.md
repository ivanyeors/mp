# Slice 07 — Diagrams and OG images (in-house, D4)

Type: AFK build + HITL owner look
Parent: PRD `guides-content`
Triage: ready

## What to build

First drafts are in `.claude/PRD-guides-content/media/` (see `media-plan.md` §1). Owner feedback on those drafts comes first.

- **Finals in `public/guides/`**, one small SVG per panel (11 files, drafted):
  - `alignment-side-{high,right,low}.svg`: a side sleeper seen from behind, with the spine as a dotted line. The neck bends up, stays level or bends down. "About right" marks the gap the pillow fills.
  - `alignment-back-{high,right,low}.svg`: a back sleeper in profile, with a gaze arrow. Chin pushed to the chest, face straight up, or head tipped back.
  - `pillow-type-{standard,contour,roll,adjustable,fitted-m}.svg`: cross-sections. The fitted M follows the house drawing: higher sides for side sleeping, a lower middle for back sleeping.
  - Shoulder measuring uses the existing real photos (`shoulderlength_800x.webp` etc.), not a new drawing.
- **Style.** The house illustration style: blue line, light-blue fill, orange accent, grey figure. Each SVG carries a `<style>` with a `prefers-color-scheme: dark` block, so it works as an `<img>` in both themes. "About right" is blue and "off" is orange, a pair that stays distinct for colour-blind readers. Each panel also has a word caption, so no meaning rests on colour alone (WCAG 1.4.1).
- **No words inside the SVGs.** Captions ("Too high: the neck bends up") are HTML text under each panel, so zh-CN needs no new artwork (slice 12). Panels sit 3-up on desktop and 1-up on phones, so each stays legible.
- **OG images.** One per guide at 1200×630: the guide's question over its hero diagram, generated with `next/og` from the same SVG.
- **Media library.** Add each file with its alt text and "in-house, Mpillow" provenance.

## Acceptance criteria

- [ ] Owner has OK'd the drafts (comment in this folder or the PR).
- [ ] `pnpm checks guides` passes: every image path exists and has alt text.
- [ ] Preview screenshots at 390 px show every panel and caption readable without zoom, in light and dark.

## Blocked by

None (drafts exist). Swaps into slices 03–05 when merged.
