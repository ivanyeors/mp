# Slice 07 — X-ray read-only upgrade of the preview mix visual

Type: AFK
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: needs-triage
User stories covered: 38, 39

## What to build

Swap the completed preview's text mix summary for the spatial x-ray renderer in **read-only** mode — one renderer, two consumers.

- The recommended **Filling Template**'s placements render inside the pillow silhouette using the spatial PRD's x-ray renderer (silhouette ∩ cell clip paths, fluid shapes, deterministic slots) with hover-dive editing disabled — guests view, never edit (Staff editing remains the spatial PRD's assist mode).
- The slice-05 reveal gate applies unchanged: the visual appears only on the completed preview.
- Templates still in legacy-flat form (no placements) keep the text mix summary — graceful degradation, no fork of the renderer.
- Mbolster preview uses the bolster variant of the renderer (single compartment) the same way.

## Acceptance criteria

- [x] A spatially-defined recommended template renders in the x-ray silhouette on the completed preview; guests get no edit affordances (no hover-dive, no add/remove)
- [x] Legacy-flat templates fall back to the text mix summary without error
- [x] Identical placements render identically here and in Staff assist (shared renderer, deterministic slots)
- [x] `*.check.ts` for the read-only mode flag and fallback selection (`lib/rules-engine/slice-07.check.ts`)

## Blocked by

- Slice 05 (preview recommendation display)
- Spatial PRD slice 07 (x-ray renderer) — hard dependency; this slice waits for it
