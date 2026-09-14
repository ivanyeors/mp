-- Insert order (CONTEXT.md): the 1-based step at which a piece goes into its
-- Section (left / center / right) when the pillow is assembled. Per-Section
-- sort key; null = not authored, which sorts last so a piece added after
-- ordering is simply the next step. Sub-sections and layers are not part of it.
-- Assembly only: the pack list, COGS and the fingerprint ignore it, exactly
-- like row_index. Bolster tables untouched — a single compartment is already
-- an ordered slot list (ADR 0008). Additive and nullable: existing rows and
-- code that does not write the column keep working.

alter table filling_template_placements
  add column if not exists insert_order int
  check (insert_order is null or insert_order >= 1);

alter table result_filling_placements
  add column if not exists insert_order int
  check (insert_order is null or insert_order >= 1);
