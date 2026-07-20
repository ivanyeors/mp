-- X-ray stack DEPTH: row_index is now an ordered depth layer (0 = top/front in
-- the top-down view, increasing = deeper), not a 0/1 top/bottom lane. Relax the
-- shipped `in (0,1)` check to the per-cell depth range (0..4, since max 5 pieces).
-- Inline column checks auto-name `<table>_<column>_check`. Still visual-only —
-- out of the fingerprint. Bolster tables untouched (single compartment).

alter table filling_template_placements drop constraint if exists filling_template_placements_row_index_check;
alter table filling_template_placements add constraint filling_template_placements_row_index_check check (row_index is null or row_index between 0 and 4);

alter table result_filling_placements drop constraint if exists result_filling_placements_row_index_check;
alter table result_filling_placements add constraint result_filling_placements_row_index_check check (row_index is null or row_index between 0 and 4);
