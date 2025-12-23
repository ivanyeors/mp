-- Rename legacy filling subtypes to exact new names and insert missing ones

-- Remove wrong variants from 0005 to avoid duplicates
delete from items where category='filling' and subtype in ('6D+-L');

-- Rename legacy hyphenated to parenthetical
update items set subtype='3D (S)' where category='filling' and subtype='3D-S';
update items set subtype='6D (S)' where category='filling' and subtype='6D-S';
update items set subtype='6D (L)' where category='filling' and subtype='6D-L';
update items set subtype='6D+ (L)' where category='filling' and subtype='6D-L+';

-- Rename variants added in 0005 to parenthetical
update items set subtype='6D (Round)' where category='filling' and subtype='6D-Round';
update items set subtype='6D+ (Folded)' where category='filling' and subtype='6D+-Folded';
update items set subtype='6D+ (S)' where category='filling' and subtype='6D+-S';
update items set subtype='6D (M)' where category='filling' and subtype='6D-M';
update items set subtype='6D (XL)' where category='filling' and subtype='6D-XL';

-- Ensure all desired new subtypes exist (idempotent)
insert into items (category, name, subtype, size, is_active)
values
  ('filling','filling','3D (S)',null,true),
  ('filling','filling','6D (Round)',null,true),
  ('filling','filling','6D+ (Folded)',null,true),
  ('filling','filling','6D (S)',null,true),
  ('filling','filling','6D+ (S)',null,true),
  ('filling','filling','6D (M)',null,true),
  ('filling','filling','6D (L)',null,true),
  ('filling','filling','6D+ (L)',null,true),
  ('filling','filling','6D (XL)',null,true)
on conflict do nothing;

-- Optionally deactivate legacy 3D-L if present
update items set is_active=false where category='filling' and subtype='3D-L';
