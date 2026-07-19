-- Rules Engine slice 01: versioned Rule graphs per flow (draft + immutable published).

create table if not exists rule_graphs (
  id            uuid primary key default gen_random_uuid(),
  flow          text not null check (flow in ('premium-mpillow', 'basic-mpillow', 'mbolster')),
  version       integer,
  status        text not null check (status in ('draft', 'published')),
  graph         jsonb not null,
  author_id     uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint rule_graphs_draft_version_null check (
    (status = 'draft' and version is null) or
    (status = 'published' and version is not null)
  )
);

-- One editable draft per flow.
create unique index if not exists uq_rule_graphs_draft
  on rule_graphs (flow) where status = 'draft';

-- Immutable published versions: unique version number per flow.
create unique index if not exists uq_rule_graphs_published_version
  on rule_graphs (flow, version) where status = 'published';

create index if not exists idx_rule_graphs_flow_status
  on rule_graphs (flow, status);

drop trigger if exists trg_rule_graphs_updated_at on rule_graphs;
create trigger trg_rule_graphs_updated_at
before update on rule_graphs
for each row execute procedure set_updated_at();

alter table rule_graphs enable row level security;

drop policy if exists "Service role full access rule_graphs" on rule_graphs;
create policy "Service role full access rule_graphs" on rule_graphs
for all using (true) with check (true);
