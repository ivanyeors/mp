-- Result snapshot copies of spatial placements (ADR 0008): same shape as the
-- template tables but keyed by result — a copy, not an FK to template placements,
-- so the Result keeps its mix even if the catalog template later changes.
-- Results live on mp_config_responses (see 0044_results.sql).

create table if not exists result_filling_placements (
  result_id uuid not null references mp_config_responses(id) on delete cascade,
  section text not null check (section in ('left', 'center', 'right')),
  sub_section text not null check (sub_section in ('front', 'middle', 'back')),
  slot int not null check (slot between 1 and 5),
  item_id bigint not null references items(id) on delete restrict,
  qty int not null default 1 check (qty = 1),
  primary key (result_id, section, sub_section, slot)
);

create table if not exists result_bolster_filling_placements (
  result_id uuid not null references mp_config_responses(id) on delete cascade,
  slot int not null check (slot >= 1),
  item_id bigint not null references items(id) on delete restrict,
  qty int not null default 1 check (qty = 1),
  primary key (result_id, slot)
);

-- Normalized hash of the spatial snapshot; null until a snapshot is written.
alter table mp_config_responses
  add column if not exists filling_fingerprint text;
