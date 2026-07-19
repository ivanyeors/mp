-- Spatial filling placements (ADR 0008): placement rows are the "where" truth for
-- role = 'filling' templates; the pack list stays a derived flatten. Warehouse
-- templates must never carry placements (ADR 0003) — enforced by trigger below.

create table if not exists filling_template_placements (
  template_id bigint not null references bom_templates(id) on delete cascade,
  section text not null check (section in ('left', 'center', 'right')),
  sub_section text not null check (sub_section in ('front', 'middle', 'back')),
  -- slot 1–5 + PK uniqueness = max 5 pieces per cell
  slot int not null check (slot between 1 and 5),
  item_id bigint not null references items(id) on delete restrict,
  -- each row is one piece
  qty int not null default 1 check (qty = 1),
  primary key (template_id, section, sub_section, slot)
);

-- Mbolster: own schema — single compartment (no section columns), no piece cap in v1.
create table if not exists bolster_template_placements (
  template_id bigint not null references bom_templates(id) on delete cascade,
  slot int not null check (slot >= 1),
  item_id bigint not null references items(id) on delete restrict,
  qty int not null default 1 check (qty = 1),
  primary key (template_id, slot)
);

create or replace function assert_placement_template_is_filling()
returns trigger as $$
begin
  if (select role from bom_templates where id = new.template_id) is distinct from 'filling' then
    raise exception 'Placements may only attach to bom_templates with role = filling (template_id %)', new.template_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_filling_template_placements_role on filling_template_placements;
create trigger trg_filling_template_placements_role
before insert or update on filling_template_placements
for each row execute procedure assert_placement_template_is_filling();

drop trigger if exists trg_bolster_template_placements_role on bolster_template_placements;
create trigger trg_bolster_template_placements_role
before insert or update on bolster_template_placements
for each row execute procedure assert_placement_template_is_filling();
