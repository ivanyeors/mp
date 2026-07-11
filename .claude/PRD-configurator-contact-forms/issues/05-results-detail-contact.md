# Slice 05 — Results detail: phone + Discovery source (+ Other)

Type: AFK
Parent: PRD `configurator-contact-forms` (`.claude/PRD-configurator-contact-forms/configurator-contact-forms-prd.md`)
Triage: needs-triage
User stories covered: 38–41

## What to build

Show persisted contact and attribution on the operator Results detail page.

- Next to email on `/settings/results/[id]`: customer phone, Discovery source (resolved label from catalog, including archived), and Other free text when present.
- Fallback to raw `discovery_source` id if label cannot be resolved.
- No Results list columns, filters, or Analytics charts in this slice.

## Acceptance criteria

- [x] Results detail shows phone when present.
- [x] Results detail shows Discovery source label (or id fallback) when present.
- [x] Other free text shows when `discovery_source` is Other / `discovery_source_other` is set.
- [x] Results list and Analytics are unchanged.

## Blocked by

- [`.claude/PRD-configurator-contact-forms/issues/02-catalog-schema-validation.md`](02-catalog-schema-validation.md)
- [`.claude/PRD-configurator-contact-forms/issues/04-preview-contact-hold.md`](04-preview-contact-hold.md)

## Status

Done (2026-07-11). Prove: `npx tsx lib/discovery-source/forms-preview-contact.check.ts`
