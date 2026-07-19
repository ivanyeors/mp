# Slice 02 — Rules Engine workbench: React Flow canvas, palette, test panel, versions

Type: HITL (canvas UX review on real graphs)
Parent: PRD `rules-engine` (`.claude/PRD-rules-engine/rules-engine-prd.md`)
Triage: needs-triage
User stories covered: 1, 2, 3, 4, 6, 7, 12, 15

## What to build

The ComfyUI-style authoring surface: Admin Panel → Landing Site → **Product Builder → Rules Engine** entry point opening a full breadcrumbed page (Product Builder / Rules Engine / {flow}).

- Add `@xyflow/react` — this PRD's one approved new dependency. Evaluation/validation stay in `lib/rules-engine/` (slice 01); the canvas is authoring UI only.
- Flow switcher (Premium Mpillow / Basic Mpillow / Mbolster); infinite canvas with pan/zoom, minimap, node palette (drag to add), type-checked ports (e.g. Range only accepts numeric inputs; Template output only reachable after a Size output resolves).
- Node editors: Range bands authored in **inches** (canonical cm underneath); Match edges per enum value; Template output pickers filtered to the resolved size's **Filling Templates**.
- Version bar: draft autosave, Publish (running slice-01 validation; errors pinned on offending nodes), read-only view of published versions, restore-to-draft.
- Test panel: enter sample answers, fired path highlights on the canvas, resolved outputs (size, template, tier suggestion, flow route) shown — the human-runnable check for authored graphs.

## Acceptance criteria

- [ ] Staff (`page-builder` perm) can build, save, and publish the seeded Premium graph entirely on the canvas; guests/other perms never see the page
- [ ] Publish failures pin errors to the offending nodes; a valid graph publishes as an immutable version
- [ ] Test panel highlights the fired path and matches `evaluate()` output exactly for the same inputs
- [ ] Past versions render read-only and restore to draft without mutating history
- [ ] `*.check.ts` for page mount, perm gating, and save/publish API contract

## Blocked by

- Slice 01 (schema + engine core)
