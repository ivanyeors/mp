-- Fine position (X-ray pillow UX slice 08): how far, in millimetres, a pouch
-- sits from its home in its cell — +x toward the right of the pillow, +y toward
-- the back. Pouches are drawn at their true size, so a pouch smaller than its
-- compartment leaves free space, and staff drag it where the build puts it.
-- Visual only: the pack list, COGS and the fingerprint ignore it, exactly like
-- row_index and insert_order. null = at home. The bound matches MAX_OFFSET_MM
-- in lib/spatial-fillings/core.ts. Bolster tables untouched (single line,
-- fills its capsule). Additive and nullable.

alter table filling_template_placements
  add column if not exists offset_x_mm smallint check (offset_x_mm is null or abs(offset_x_mm) <= 200),
  add column if not exists offset_y_mm smallint check (offset_y_mm is null or abs(offset_y_mm) <= 200);

alter table result_filling_placements
  add column if not exists offset_x_mm smallint check (offset_x_mm is null or abs(offset_x_mm) <= 200),
  add column if not exists offset_y_mm smallint check (offset_y_mm is null or abs(offset_y_mm) <= 200);
