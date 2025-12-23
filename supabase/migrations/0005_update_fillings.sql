-- Update fillings: add new subtypes if missing
-- New subtypes requested:
-- 3D-S
-- 6D-Round
-- 6D+-Folded
-- 6D-S
-- 6D+-S
-- 6D-M
-- 6D-L
-- 6D+-L
-- 6D-XL

insert into items (category, name, subtype, size)
values
  ('filling','filling','3D-S',null),
  ('filling','filling','6D-Round',null),
  ('filling','filling','6D+-Folded',null),
  ('filling','filling','6D-S',null),
  ('filling','filling','6D+-S',null),
  ('filling','filling','6D-M',null),
  ('filling','filling','6D-L',null),
  ('filling','filling','6D+-L',null),
  ('filling','filling','6D-XL',null)
on conflict do nothing;