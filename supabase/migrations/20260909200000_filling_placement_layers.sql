-- Layers: a cell is up to five depth planes and a layer holds up to five pieces
-- side by side, so `row_index` is no longer distinct per cell — several pieces
-- share a layer. The layer range (0..4) is unchanged; what has to move is the
-- SLOT range, which is the per-cell piece key: 5 layers x 5 pieces = 25.
--
-- Widening a check constraint accepts every row already stored, so this is
-- additive: existing recipes (one piece per depth, slots 1..5) stay valid and
-- keep rendering identically. The per-layer cap is counted in
-- validatePillowPlacements — a check constraint cannot see sibling rows.
--
-- Inline column checks auto-name `<table>_<column>_check`. Bolster tables are
-- untouched: a single compartment has no layers (ADR 0008).

alter table filling_template_placements drop constraint if exists filling_template_placements_slot_check;
alter table filling_template_placements add constraint filling_template_placements_slot_check check (slot between 1 and 25);

alter table result_filling_placements drop constraint if exists result_filling_placements_slot_check;
alter table result_filling_placements add constraint result_filling_placements_slot_check check (slot between 1 and 25);
