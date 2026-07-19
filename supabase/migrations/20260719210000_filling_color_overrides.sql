-- Slice 11: Product Builder — per-filling-subtype color overrides for the x-ray
-- CSS-variable pipeline (ADR 0009 guardrail 5). Shape stays a code/designer
-- concern; only color is data. No row = code default applies.

create table if not exists filling_color_overrides (
  subtype     text primary key,
  color       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_filling_color_overrides_updated_at on filling_color_overrides;
create trigger trg_filling_color_overrides_updated_at
before update on filling_color_overrides
for each row execute procedure set_updated_at();

alter table filling_color_overrides enable row level security;

drop policy if exists "Service role full access filling_color_overrides" on filling_color_overrides;
create policy "Service role full access filling_color_overrides" on filling_color_overrides
for all using (true) with check (true);
