-- X-ray stacking lane for Mpillow fillings: 0 = top, 1 = bottom, null = auto
-- layout (backward-compatible default). Visual only — the pack list ignores it,
-- so it stays out of the fingerprint. Bolster tables untouched (single
-- compartment, no sub-sections). PK (…, slot) unchanged; a row is shared freely.

alter table filling_template_placements
  add column if not exists row_index int
  check (row_index is null or row_index in (0, 1));

alter table result_filling_placements
  add column if not exists row_index int
  check (row_index is null or row_index in (0, 1));
