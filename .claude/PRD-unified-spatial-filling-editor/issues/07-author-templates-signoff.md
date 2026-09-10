# Unified filling editor 07 (HITL): author the ten pillow Filling Templates + physical build sign-off

Tracker: #116
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

Nothing. This slice is the human authoring pass — the only thing in this PRD that actually fixes the data, and deliberately not automated.

Ten pillow **Filling Templates** carry **Placement** rows that no person laid out. They were materialised by the 2026-07-24 backfill from flat legacy `bom_template_lines` using a fill-cells-in-order spread, which fills all three left **cells** before reaching center. Eight of the ten sit entirely in `left`; the two XL templates spill one and two pieces into `center`. None places a piece in `right`.

An automatic re-spread was considered and rejected during drafting: it would be a guess about a physical product, and a guess that looks authored is worse than an artefact that is labelled. Slices 01–06 exist to make the guess unnecessary — the templates are flagged, and the editor gives real feedback about what is being built.

**The pass.** For each of the ten templates, open the Configure page, dive into each **Section**, and place the pieces where they physically go. `CONTEXT.md` states the intended split: side-sleep support in the left and right **Sections**, back-sleep support in center. The constraints worth knowing while authoring — the same **Item** may repeat within a **cell** and across **cells**, the cap is five pieces per **cell**, empty **cells** are legal, and nine **cells** at five pieces is forty-five against a maximum of seventeen pieces in any current template, so every recipe fits comfortably.

**The invariant.** Authoring moves pieces between **cells**. It must not change what the build team picks. Each template's derived pack list — the flatten of `item_id` counts — must be identical before and after. Confirm this per template rather than assuming it.

**Why now.** Production holds one `mp_config_responses` row, none with a `filling_fingerprint` or a `filling_template_id`, and both **Result** placement tables are empty. Re-authoring today invalidates no **Result** snapshot, no analytics fingerprint and no **Unpromoted configuration** ranking. Once a real customisation is held, moving a piece between **cells** changes the canonical fingerprint, which changes what the unpromoted ranking groups — recoverable, but no longer free. This slice should land before the first real hold.

**Sign-off.** The x-ray exists so **Staff** can compare it against the physical build (ADR 0009 guardrail 3). Each authored template needs that comparison made against a real pillow, not merely a layout that looks plausible on screen.

Do not revert or edit the backfill migration. It is applied, idempotent, and skips templates that already have placements — once a template is authored it will never touch it again. Its header comment explains why the first spread is only a placeholder, and should be read by anyone tempted to write a second one.

## Acceptance criteria

- [ ] All ten pillow **Filling Templates** occupy more than one **Section** and no longer show the **Spatially authored** warning.
- [ ] Side-sleep support sits in the left and right **Sections**, back-sleep support in center, matching the meaning `CONTEXT.md` gives the **Section** enum.
- [ ] Each template's derived pack list is byte-identical before and after authoring, verified per template.
- [ ] Stack depth is used where the physical build actually layers pieces, rather than left auto everywhere by default.
- [ ] Each authored template is compared against a physical build and signed off by a person.
- [ ] The unauthored count on the Configure list reads zero for pillow templates.
- [ ] The three bolster **Filling Templates** are untouched.
- [ ] The 2026-07-24 backfill migration is neither reverted nor edited.
- [ ] Completed before any customer **Result** carries a filling snapshot; confirm the production counts are still zero at the time of the pass.

## Blocked by

- #114 (the **X-ray editor** must be live in Configure before the pass can be done in it)

