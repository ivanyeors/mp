# Slice 01 — Domain glossary + ADR 0007

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 41, 42

## What to build

Record locked journey vocabulary and architectural decision before schema work.

- Update `CONTEXT.md` with **Visitor**, **Visit**, **Prospect**, **Entry source**, **Drop-off**; keep **Discovery source** distinct; avoid “Customer journey” (Appointment collision).
- Write `docs/adr/0007-first-party-journey-analytics.md`: DB as SoT, always-on collection with analytics notice, Visitor + GA client id stitch, deterministic merge only, unique-node transition graph over Sankey, Prospect-default Admin viz. Note coexistence with ADR 0006 P&L Analytics.

## Acceptance criteria

- [x] `CONTEXT.md` defines the new terms and relationships without implementation file paths as domain rules
- [x] ADR 0007 exists and states why Sankey and probabilistic cross-device merge were rejected
- [x] ADR notes Admin graph reads DB only (including GA extract staged in DB)

## Status

**Done** — verified 2026-07-15 (glossary + ADR 0007; AC self-check script passed).

## Blocked by

None - can start immediately
