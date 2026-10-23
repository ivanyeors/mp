-- Shipping › Couriers slice 04: package sizes come from the courier account's boxes.
-- Copies each shipping_settings.packages profile into the easyship doc as a box and
-- maps its item type to it (settings.box_for_type). Units: profiles and boxes are
-- both cm; a box's `weight` is its empty weight in kg, so it seeds as 0 and the
-- profile's packed weight becomes the type's content weight. A box that already
-- has the name is kept as it is, and an existing mapping is never overwritten.
-- A no-op when nothing has been saved to the doc yet (no `settings` object).
do $$
declare
  pk jsonb;
  doc jsonb;
  item_type text;
  box_name text;
  p jsonb;
begin
  select packages into pk from shipping_settings where id;
  select config -> 'settings' into doc from api_configs where slug = 'easyship';
  if pk is null or doc is null or jsonb_typeof(doc) <> 'object' then
    return;
  end if;

  for item_type, box_name in
    select * from (values ('pillow', 'Pillow box'), ('bolster', 'Bolster box'), ('accessory', 'Accessory box')) v
  loop
    p := pk -> item_type;
    continue when p is null;

    if not exists (
      select 1 from jsonb_array_elements(coalesce(doc -> 'boxes', '[]'::jsonb)) b
      where lower(trim(b ->> 'name')) = lower(box_name)
    ) then
      doc := jsonb_set(doc, '{boxes}', coalesce(doc -> 'boxes', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'name', box_name,
        'outer_length', (p ->> 'length_cm')::numeric,
        'outer_width', (p ->> 'width_cm')::numeric,
        'outer_height', (p ->> 'height_cm')::numeric,
        'weight', 0
      )));
    end if;

    if doc -> 'box_for_type' -> item_type is null then
      doc := jsonb_set(doc, '{box_for_type}', coalesce(doc -> 'box_for_type', '{}'::jsonb) || jsonb_build_object(
        item_type, jsonb_build_object('box', box_name, 'weight_grams', round((p ->> 'weight_grams')::numeric)::int)
      ));
    end if;
  end loop;

  update api_configs set config = jsonb_set(config, '{settings}', doc) where slug = 'easyship';
end $$;
