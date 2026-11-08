# Slice 16 — Earned mentions playbook

Type: OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 38

## What to build

- Target list: Singapore "best pillow / bolster" listicles (e.g. Honeycombers, bestinsingapore.co, Shopee blog, TheSmartLocal), physio/chiro partners (`/our-partners`), parenting and sleep communities
- Pitch asset: the fit report (slice 11) + in-store fitting invite
- Community: authentic, disclosed staff participation on r/singapore / HardwareZone threads where pillows are asked about; no astroturfing
- Video: short fitting and filling-adjustment clips on YouTube (Shorts) with descriptions linking to guides
- Log every placement as an `seo_annotations` row (category `earned`)

## Acceptance criteria

- [ ] Target list with owner and status kept in this folder
- [ ] Each live placement annotated with its URL

## Blocked by

Slice 05

## Implementation notes

- Since 2026-11-08 a monthly Claude scheduled task ("Mpillow off-site SEO report", the 28th of
  each month) does the research half of this slice: it finds mentions, scouts and scores
  opportunities against a white-hat vetting rubric, collects news hooks and maps which kind of
  site wins each target search. It writes each month into one Claude dashboard (owner's
  account), so months can be compared side by side. The target list lives there, not in this
  folder.
- The playbook, rubric and report format: `.claude/skills/seo-monthly-report/SKILL.md`.
- People still do every outreach step. Log each live placement as an `earned` annotation as
  before; the next run marks the matching opportunity `Won`.
