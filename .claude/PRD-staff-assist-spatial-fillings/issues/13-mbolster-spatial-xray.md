# Slice 13 — Mbolster: own spatial schema + assist + x-ray

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 41

## What to build

Extend the whole flow to **Mbolster** with its **own spatial schema** — one long compartment, **no piece cap** in v1, no reuse of the Mpillow Section/sub-section enums (ADR 0008 amendment). Same inventory filling Items; pack list still derived.

- Bolster placement + snapshot tables (from Slice 01 migrations) wired through template API, Configure editor, assist chrome on `/mbolster-config`, hold snapshot, assign, and ranking
- X-ray treatment on the bolster capsule silhouette (single region — hover/dive simplified accordingly)
- Case-only preference rules and length-based eligibility respected throughout

## Acceptance criteria

- [ ] Staff on `/mbolster-config` can load/edit a bolster filling mix and hold-create writes the snapshot
- [ ] Bolster placements never validate against pillow enums; no cap enforced
- [ ] Bolster x-ray renders pieces inside the capsule per ADR 0009 guardrails
- [ ] Bolster unpromoted mixes rank under bolster length cards in the Filling Config tab
- [ ] Vitest for the bolster schema validation + flatten

## Blocked by

- Slice 06 — assign spatial
- Slice 08 — x-ray dive editing
