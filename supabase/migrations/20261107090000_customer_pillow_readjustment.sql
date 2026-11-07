-- A Re-adjustment's fillings on the Customer's pillow (ADR 0042 l).
--
-- At a Re-adjustment visit Staff change the fillings in a pillow the customer
-- already has. The Customer page's Re-adjust opens the x-ray editor on the
-- pillow drawn there and saves the mix they leave in it here, on the Staff
-- link (`customer_pillows`), so the Customer page and the customer's Profile
-- draw the pillow as it now is.
--
-- `filling_placements` is that mix: one row per piece, shaped as an order
-- line's frozen build (`customization_snapshot.filling_placements`) and as
-- `filling_template_placements` — section, sub_section, slot, item_id,
-- row_index, insert_order, offset_x_mm, offset_y_mm. Null is a plain link: the
-- size and Filling Template, drawn as the template is now. Not null is a
-- re-adjusted pillow: drawn from these rows, and `filling_template_id` names
-- the template it was re-adjusted from, for Staff to read.
--
-- Like the link it rides on, it describes the pillow the customer has. It is
-- not a Result or a build: it moves no stock, sets no price and reaches no
-- analytics. Change pillow writes null here; removing the link deletes it.
--
-- Idempotent.

alter table public.customer_pillows
  add column if not exists filling_placements jsonb null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_pillows_filling_placements_array'
      and conrelid = 'public.customer_pillows'::regclass
  ) then
    alter table public.customer_pillows
      add constraint customer_pillows_filling_placements_array
      check (filling_placements is null or jsonb_typeof(filling_placements) = 'array');
  end if;
end $$;

comment on column public.customer_pillows.filling_placements is
  'A Re-adjustment''s mix (ADR 0042 l): placement rows drawn instead of the template. Null for a plain link.';
