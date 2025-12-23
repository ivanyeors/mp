alter table items drop constraint if exists items_category_check;

alter table items
  add constraint items_category_check
  check (category in ('cover','case','protector','filling','packaging','accessories','other'));


