-- X-ray pillow UX slice 12: Settings overrides for the dimension registry
-- (ADR 0019). Pillow geometry stays in code; only filling pouch and Neck
-- support dimensions are data here, on the filling_color_overrides pattern:
-- a row wins, no row = the code default in lib/spatial-fillings/dimensions.ts.
-- The loft allowance lives in site_settings under 'xray_loft_allowance_pct'.

create table if not exists filling_dimension_overrides (
  key               text primary key,            -- registry key, e.g. '6d/l', '6d/folded/m'
  width_mm          integer not null check (width_mm > 0),
  length_mm         integer not null check (length_mm > 0),
  thickness_mm      integer not null check (thickness_mm > 0),
  min_thickness_mm  integer not null check (min_thickness_mm > 0),
  min_width_mm      integer not null check (min_width_mm > 0),
  orientation       text not null check (orientation in ('across', 'along')),
  flat_length_mm    integer check (flat_length_mm is null or flat_length_mm > 0),
  flat_width_mm     integer check (flat_width_mm is null or flat_width_mm > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint filling_dimension_overrides_min_thickness check (min_thickness_mm <= thickness_mm),
  constraint filling_dimension_overrides_min_width check (min_width_mm <= width_mm)
);

drop trigger if exists trg_filling_dimension_overrides_updated_at on filling_dimension_overrides;
create trigger trg_filling_dimension_overrides_updated_at
before update on filling_dimension_overrides
for each row execute procedure set_updated_at();

alter table filling_dimension_overrides enable row level security;

drop policy if exists "Service role full access filling_dimension_overrides" on filling_dimension_overrides;
create policy "Service role full access filling_dimension_overrides" on filling_dimension_overrides
for all using (true) with check (true);

create table if not exists neck_support_dimension_overrides (
  size              text primary key check (size in ('XS', 'S', 'M', 'L')),
  width_mm          integer not null check (width_mm > 0),
  length_mm         integer not null check (length_mm > 0),
  thickness_mm      integer not null check (thickness_mm > 0),
  min_thickness_mm  integer not null check (min_thickness_mm > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint neck_support_dimension_overrides_min_thickness check (min_thickness_mm <= thickness_mm)
);

drop trigger if exists trg_neck_support_dimension_overrides_updated_at on neck_support_dimension_overrides;
create trigger trg_neck_support_dimension_overrides_updated_at
before update on neck_support_dimension_overrides
for each row execute procedure set_updated_at();

alter table neck_support_dimension_overrides enable row level security;

drop policy if exists "Service role full access neck_support_dimension_overrides" on neck_support_dimension_overrides;
create policy "Service role full access neck_support_dimension_overrides" on neck_support_dimension_overrides
for all using (true) with check (true);
