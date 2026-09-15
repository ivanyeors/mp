-- Size-agnostic Filling Templates: one recipe may serve several sizes.
--
-- Before this, a Filling Template was scoped to exactly one size key, so an
-- operator re-authored the same mix once per size and the copies drifted.
-- Membership now lives in its own table and is the authority for "which sizes
-- does this recipe serve".
--
-- bom_templates.key stays, and is kept in sync with the canonically-first
-- member key by the application's single membership writer. It is therefore
-- always a real member — never a second, divergent source of truth — which
-- keeps the legacy uniques and any reader that has not moved to membership
-- truthful (if partial). Warehouse templates are untouched: they are scoped by
-- size AND tier and are never shared.

create table if not exists bom_template_keys (
  template_id bigint not null references bom_templates (id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (template_id, key)
);

-- List query: "every filling template serving size M" hits this.
create index if not exists idx_bom_template_keys_key on bom_template_keys (key);

alter table bom_template_keys enable row level security;

-- Backfill: every existing filling template serves exactly the size it was
-- authored for, so behaviour is identical until an operator shares one.
insert into bom_template_keys (template_id, key)
select id, key from bom_templates where role = 'filling'
on conflict do nothing;
