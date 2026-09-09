# PRD: Unified Spatial Filling Editor — one x-ray everywhere, and templates that use all three Sections

Status: Draft (needs-triage)
Source: Staff-assist screenshot audit (Sep 2026) — every default **Filling Template** renders entirely in the `left` **Section**; traced to the 2026-07-24 placement backfill, confirmed against production.
ADRs: `docs/adr/0003-fillings-only-in-filling-templates.md` (fillings never on warehouse BOMs), `docs/adr/0008-spatial-filling-placements.md` (**Placement** rows are the "where" truth; pack list is derived), `docs/adr/0009-xray-filling-visuals.md` (x-ray guardrails: no box cropping, legible piece count, deterministic layout, prepared morphs, one asset pipeline)
Glossary: `CONTEXT.md` — **Filling Template**, **Filling configuration**, **Placement**, **Section**, **sub-section**, **cell**, **Default Filling Template**, **Staff assist mode**, **Promote**, **Unpromoted configuration**, **Result**, **Admin Panel**, **Composed sellable**, **Tier**
Decisions taken before drafting: (a) no migration re-spreads placement data — the editor plus an explicit "not spatially authored" warning ships, and **Staff** author the ten templates by hand; (b) the x-ray replaces the 3×3 cell grid on **both** the Configure filling template page and the **Result** detail assign editor, retiring the grid component.

## Problem Statement

Open the **Mpillow** configurator in **Staff assist mode**, pick Size M / Basic, and load `M - basic - default`. Every pouch renders in the left third of the pillow. The center and right **Sections** are empty. It looks like a bug in the renderer. It is not — the data really is like that, and it is like that for every default **Filling Template** in production:

| Template | pieces | left | center | right |
|---|---|---|---|---|
| XS / S / M / L — basic and premium (8 templates) | 7–15 | all | 0 | 0 |
| XL - basic - default | 16 | 15 | 1 | 0 |
| XL - premium - default | 17 | 15 | 2 | 0 |

No template in the catalog places a single piece in the `right` **Section**.

The cause is a legacy import. The original seed moved filling lines off **Composed sellable** BOMs into flat `bom_template_lines` — quantities only, with no spatial information, because none existed. The 2026-07-24 backfill then materialised **Placement** rows from those flat lines using a deterministic fill-cells-in-order spread: it fills all three left **cells** (3 × 5 = 15 pieces) before it reaches center. Only XL has more than 15 pieces, which is why only XL spills. The backfill was honest about being a placeholder — it exists so the editor is not blank — but nobody went back to author the real recipes, and there is nothing in any surface that says the recipes are unauthored. **Staff** cannot tell a deliberate left-heavy build from an import artefact.

This matters beyond looks. `CONTEXT.md` defines the **Section** enum as load-bearing: *"Side-sleep support lives in left/right; back-sleep support in center."* A recipe that puts everything in `left` is not a description of a pillow anyone can build. The x-ray exists so **Staff** can compare it against the physical build; today it cannot be compared against anything.

The second problem is why the data was never fixed: **there are three ways to edit the same spatial recipe, and they are three different interactions.**

- In the configurator (**Staff assist mode**), **Staff** get the x-ray: click a **Section** to dive into it, add pieces from a radial picker, drag to reorder stack depth, remove from a chip on the pouch. It renders the actual pillow silhouette.
- In the **Admin Panel** at Settings → Inventory → Configure, where **Filling Templates** are actually authored, they get a 3×3 grid of dropdown lists. Nine boxes of `<select>` elements. No silhouette, no depth, no sense of what the pillow looks like.
- On the **Result** detail assign editor, they get the same 3×3 grid.

So the one surface that can fix the catalog is the one that gives the least feedback about what is being built. A person authoring `M - premium - default` in the grid has no way to see that they have produced a left-packed pillow. The interaction that would make the problem obvious is only available in a surface that cannot save to the catalog.

A third, smaller defect compounds it: the staff-assist endpoint that loads a template into the x-ray does not select `row_index`, while every other **Placement** reader does. A template authored with stacked **cells** loads into **Staff assist mode** flattened to side-by-side, so **Staff** and the shopper preview can render the same template differently.

Now is the moment to fix the data: production has one `mp_config_responses` row, zero with a `filling_fingerprint`, and zero **Result** **Placement** rows. Re-authoring the catalog invalidates no **Result** snapshot, no analytics fingerprint, and no **Unpromoted configuration** ranking. That window closes the first time a real customisation is held.

## Solution

From a **Staff** perspective: the x-ray is the filling editor, everywhere. Author a **Filling Template** in the **Admin Panel** and you get the same pillow silhouette, the same dive-into-a-**Section** interaction, the same radial picker and the same depth reordering that you get when assisting a live customer. Open a **Result** to assign one and it is the same again. Learn it once.

Any **Filling Template** whose pieces all sit in a single **Section** is called out — in the template list and on the editor itself — as never having been spatially authored, with the reason (imported from a flat legacy recipe) stated plainly. The warning clears the moment the recipe spans more than one **Section**. Nothing is silently rewritten: the pack list, the COGS and the derived flatten stay exactly as they are, and **Staff** decide where each pouch actually goes.

From a shopper perspective: nothing changes until **Staff** author the templates. After they do, the preview x-ray shows a pillow that reflects the real build.

From a developer perspective: this is mostly deletion. `XrayPillow` is already a controlled component — `placements` in, `onPlacementsChange` out, zero data fetching — so both **Admin Panel** surfaces can mount it directly. The 3×3 grid component goes away; its three pure helpers move into `lib/spatial-fillings` where the rest of the spatial vocabulary already lives. Two API routes gain one field each. No new dependency, no schema change, no migration that touches **Placement** rows.

What ships:

1. Glossary entries for the two nouns this introduces (**Spatially authored**, **X-ray editor**) so later slices share one name each.
2. A pure authoring-status module: which **Sections** a recipe occupies, and whether it counts as spatially authored.
3. The `row_index` fix on the staff-assist endpoint, so **Staff** and shopper renders of the same template agree.
4. Colour overrides and the relaxed depth range on the **Admin Panel** template route, so the x-ray renders with correct fills and can save every legal stack depth.
5. An embeddable wrapper that mounts `XrayPillow` in normal document flow, since today it only works stretched over a positioned stage.
6. The Configure filling template page switched from the 3×3 grid to the x-ray.
7. The **Result** detail assign editor switched likewise, and the grid component deleted.
8. The unauthored-template warning on the template list and the editor.
9. A human authoring pass over the ten pillow **Filling Templates**, with sign-off against a physical build.

## User Stories

### Domain and glossary

1. As a developer, I want **Spatially authored** defined in `CONTEXT.md`, so that "this template has never been laid out" has one name instead of three descriptions.
2. As a developer, I want **X-ray editor** defined and distinguished from the read-only preview x-ray shown to shoppers, so that nobody assumes the shopper surface is editable.
3. As a developer, I want the glossary to record that a single-**Section** recipe is an import artefact rather than a valid build, so that a future reader does not "fix" the warning by deleting it.

### Seeing the problem

4. As **Staff**, I want a **Filling Template** whose pieces all sit in one **Section** to be flagged in the template list, so that I can see at a glance which recipes still need authoring.
5. As **Staff**, I want the flag to explain that the placements were auto-generated from a legacy flat recipe, so that I do not mistake the layout for a deliberate design decision.
6. As **Staff**, I want the flag to disappear as soon as I place pieces in a second **Section**, so that the list tracks real progress rather than a manual checklist.
7. As **Staff**, I want the warning to appear on the editor itself and not only in the list, so that I see it in the surface where I can act on it.
8. As **Staff**, I want the warning to be advisory rather than blocking, so that a genuinely single-**Section** recipe can still be saved.
9. As a business owner, I want to know how many of the catalog's **Filling Templates** are unauthored, so that I can tell when the authoring pass is complete.

### One interaction everywhere

10. As **Staff**, I want the Configure filling template page to use the same x-ray I use in **Staff assist mode**, so that I only have to learn one filling editor.
11. As **Staff**, I want to click a **Section** in the **Admin Panel** x-ray and dive into it, so that authoring works the way assisting works.
12. As **Staff**, I want the radial filling picker in the **Admin Panel**, so that adding a piece uses the same gesture as in the configurator.
13. As **Staff**, I want to drag pieces to reorder stack depth while authoring a template, so that a template can express a front-to-back stack and not only a side-by-side row.
14. As **Staff**, I want to remove a piece from its chip on the pouch, so that removal is the same gesture in every surface.
15. As **Staff**, I want the **Result** detail assign editor to use the same x-ray, so that all three filling surfaces are identical.
16. As **Staff**, I want the x-ray to render at a sensible size inside an **Admin Panel** card rather than stretched over a full-bleed stage, so that it fits the page it is on.
17. As **Staff**, I want the derived pack list to stay visible beside the x-ray, so that I can still check COGS and what the build team will pick.
18. As **Staff**, I want the legacy-flat-recipe notice to keep working, so that saving spatially still explains that it will set **Placement** rows.
19. As **Staff**, I want the **Mbolster** compartment list left alone, so that a product with one long compartment is not forced into a 3×3 pillow metaphor.
20. As a developer, I want the 3×3 grid component deleted once nothing renders it, so that there is one filling editor in the codebase rather than two.
21. As a developer, I want the grid's pure helpers preserved where other surfaces already import them, so that deleting the component does not break the order detail page.

### Correctness of what the x-ray shows

22. As **Staff**, I want a template's stack depth to survive being loaded into **Staff assist mode**, so that a stacked **cell** does not silently flatten to side-by-side.
23. As **Staff**, I want the **Admin Panel** x-ray to use the same per-subtype colours as the configurator, so that a pouch is not one colour while authoring and another while assisting.
24. As **Staff**, I want to save a stack depth deeper than the second layer, so that the authoring API accepts every depth the database and the validator already allow.
25. As a developer, I want every **Placement** reader to select the same columns, so that a fourth surface cannot reintroduce the dropped-`row_index` class of bug.
26. As **Staff**, I want the x-ray to stay read-only where it is meant to be read-only, so that a shopper preview never gains edit affordances.

### Authoring the catalog

27. As **Staff**, I want to author each of the ten pillow **Filling Templates** so its pieces sit where they physically go, so that the x-ray can be compared against a real build.
28. As **Staff**, I want side-sleep support to sit in the left and right **Sections** and back-sleep support in center, so that the recipes match the meaning `CONTEXT.md` gives the **Section** enum.
29. As **Staff**, I want authoring a template to leave its derived pack list unchanged, so that re-authoring never moves COGS or what the build team picks.
30. As a business owner, I want the authoring pass to happen before any customer **Result** carries a filling snapshot, so that no historical **Result** or **Unpromoted configuration** fingerprint is invalidated.
31. As **Staff**, I want the ten authored templates signed off against a physical build, so that the catalog is trusted rather than merely non-empty.

### Safety and regressions

32. As a developer, I want **Placement** writes to keep going through the admin route, so that the service-role-only row-level security on the placement tables is not worked around from the browser.
33. As a developer, I want colour overrides to reach the **Admin Panel** through a server route, so that a browser client is never asked to read a service-role-only table.
34. As **Staff**, I want an over-capacity **cell** to be refused with a visible message, so that the five-piece cap behaves the same in every surface.
35. As a developer, I want the derived pack list to remain a projection of **Placement** rows, so that ADR 0008 is not quietly reopened by a second editable filling source.
36. As a developer, I want the committed knowledge graph refreshed in the same commit as the code, so that continuous integration's freshness check passes.

## Implementation Decisions

**No data migration.** The ten left-packed templates are not rewritten by code. Decision taken explicitly: any automatic re-spread would be a guess about a physical product, and a guess that looks authored is worse than an artefact that is labelled. The build ships detection and a warning; **Staff** supply the truth.

**New deep module — spatial authoring status.** A pure, browser-safe module beside the existing spatial-fillings library, holding the entire definition of "has this recipe been laid out": which **Sections** a placement list occupies, and the single predicate the three surfaces branch on. It is the only place that knows a single-**Section** recipe is suspect. Three callers (template list, template editor, **Result** assign editor) and no I/O, so it is testable in isolation and rarely changes. Bolster recipes have no **Section** enum and are never evaluated by it.

**New shallow module — embeddable x-ray frame.** `XrayPillow` renders an SVG at full width and height inside a `className`-only root, with an absolutely positioned dive overlay. It therefore requires a positioned ancestor with a definite height, which the configurator provides and an **Admin Panel** card does not. A small wrapper supplies a relatively positioned box at the x-ray's own aspect ratio. `XrayPillow` itself is not modified for this — it already takes exactly the props both new call sites can supply.

**`XrayPillow` is reused as-is.** It is already controlled: placements in, change handler out, filling items for the picker, item-subtype and item-size maps for rendering, and it derives its own read-only mode from the absence of items or a change handler. Both **Admin Panel** surfaces already load filling items carrying name, subtype and size — structurally exactly what the component wants. No new fetching is introduced in the component.

**Two API routes change, one field each.** The staff-assist endpoint's template-placement query gains `row_index`, matching every other **Placement** reader; the **Admin Panel** template route's update schema has its depth bound raised from the retired top/bottom lane to the depth range the database constraint and the placement validator already permit. The same route's read response gains the per-subtype colour overrides, because that table is service-role-only under row-level security and the browser client cannot read it — the **Admin Panel** must receive it from a server route rather than query it.

**No schema change.** `filling_template_placements`, `result_filling_placements` and their constraints are untouched. The depth column already permits the full range; only the request schema was stale.

**The grid component is deleted, its helpers move.** The 3×3 grid exports three pure helpers alongside the component, and one is imported by the order detail page. Those helpers move into the spatial-fillings library — where the **cell** and **Section** vocabulary already lives — and their existing unit test moves with them. The component file is then removed. Net lines deleted.

**Warning placement.** The unauthored flag is computed on the client from placements already loaded; it needs no new query and no stored column. Deriving it rather than persisting it means it can never go stale against the data it describes.

**Mbolster is out of the change.** The bolster compartment list stays exactly as it is. ADR 0008 is explicit that **Mbolster** has its own spatial schema and must not reuse the **Mpillow** enums, and its templates already carry placements.

## Testing Decisions

A good test here asserts external behaviour: given a placement list, what does the module say; given a request, what does the route return or reject. It does not assert how a component renders internally, which pieces of state exist, or the shape of intermediate values. The repo's established pattern is a mix of `vitest` unit tests for pure library code and executable `.check.ts` self-checks that assert route and component invariants by reading source — both are used below, matching what already exists for this subsystem.

**Tested: the authoring-status module.** Unit tests over the predicate and the section-coverage function: an empty recipe, a single-**Section** recipe (the ten templates today), a recipe spanning two **Sections**, a recipe spanning all three, and a single-piece recipe. Prior art: `lib/spatial-fillings/__tests__/xray-layout.test.ts` and `components/spatial/pillow-cell-grid.test.ts`, both pure-function suites over placement lists.

**Tested: the moved grid helpers.** The existing round-trip test for placements-to-cells and back moves with the helpers and must keep passing unchanged. It is the regression guard that the move was a move and not a rewrite.

**Tested by self-check: the `row_index` contract.** An assertion that every route reading pillow **Placement** rows selects `row_index`, so a fourth reader cannot reintroduce the drop. Prior art: `lib/spatial-fillings/api-contract.check.ts`, which already asserts table names across routes, and `lib/results/__tests__/filling-snapshot.test.ts`, which asserts route source ordering.

**Tested by self-check: the depth bound.** An assertion that the **Admin Panel** update schema's depth bound matches the constant the placement validator uses, so the two cannot drift again.

**Tested by self-check: surface parity.** An assertion that neither **Admin Panel** filling surface imports the deleted grid, and that both mount the x-ray. Prior art: `lib/rules-engine/slice-07.check.ts`, which asserts by source inspection that two routes ship placements.

**Not tested automatically:** the visual result. Whether a pouch renders in the right place against a real pillow is a human judgement, and it is the substance of the final sign-off slice. ADR 0009 guardrail 3 makes the layout deterministic, so the existing layout tests already cover the part a machine can judge.

## Out of Scope

- **Rewriting placement data in a migration.** Considered and explicitly rejected during drafting. The catalog is authored by hand.
- **Any change to the rules engine.** A rule terminates in a template output carrying a template id; it selects *which* recipe, never *where* pieces go. Nothing about this problem is configurable there, and nothing in the rule graph, its evaluation, or its recommendation record changes.
- **Mbolster spatial editing.** Its templates carry placements, it has no **Section** enum, and its compartment list is unaffected.
- **Warehouse templates.** ADR 0003 keeps them non-filling; a database trigger already refuses placements on them.
- **New filling shapes, colours or morphs.** ADR 0009's asset pipeline is untouched; only where existing shapes are placed changes.
- **The shopper-facing preview x-ray.** It stays read-only, and the read-only path is unchanged.
- **Promote and unpromoted ranking.** Those flows read the same **Placement** rows and need no change; the authoring pass happens while there is nothing to rank.
- **Storing an "authored" column.** The status is derived. Persisting it would add a column that can disagree with the data.
- **Pack list, COGS, stock commit.** All remain a derived flatten of **Placement** rows. Authoring moves pieces between **cells**; it never changes what is picked.

## Further Notes

The production numbers that justify the timing, measured while drafting: `mp_config_responses` holds one row, zero with a `filling_fingerprint` and zero with a `filling_template_id`; `result_filling_placements` and `result_bolster_filling_placements` are both empty. Re-authoring the catalog today costs nothing. Once real **Results** carry snapshots, moving a piece between **cells** changes the canonical fingerprint, which changes what the **Unpromoted configuration** ranking groups — recoverable, but no longer free.

The three bolster **Filling Templates** are fine. They carry nine to eleven pieces each in a single ordered compartment, which is the whole of their spatial model.

The backfill migration should not be reverted or edited. It is applied, it is idempotent, it skips templates that already have placements, and it is the reason the editor is not blank. Once **Staff** author a template, the backfill will never touch it again. Its header comment should be read by anyone tempted to write a second automatic spread — it already explains why the first one is only a placeholder.

Worth noting for whoever authors the recipes: the same **Item** may repeat within a **cell** and across **cells**, the cap is five pieces per **cell**, empty **cells** are legal, and `CONTEXT.md` states the intended split — side-sleep support in left and right, back-sleep support in center. Nine **cells** at five pieces is forty-five, and no current template exceeds seventeen pieces, so every recipe fits comfortably.
