# Slice 03 — Landing Site → Forms admin (locale tabs, reorder, archive, Other lock)

Type: AFK
Parent: PRD `configurator-contact-forms` (`.claude/PRD-configurator-contact-forms/configurator-contact-forms-prd.md`)
Triage: needs-triage
User stories covered: 26–37

## What to build

Operator UI to manage the Discovery source option list.

- Settings nav: **Landing Site → Forms** → `/settings/forms` (page-builder permission; breadcrumbs).
- Page: manage Discovery source options — add, edit labels with **en-US / zh-CN** locale tabs, reorder, archive (soft-hide).
- **Other** is fixed system: not deletable; stays last for visitors; labels may still be editable if useful.
- Wire to catalog admin API from slice 02; toast on save; empty/error states consistent with other Landing Site settings.

No configurator preview changes in this slice (those are slice 04).

## Acceptance criteria

- [x] Forms appears under Landing Site in settings sidebar; gated by page-builder.
- [x] Operator can add/edit/reorder/archive Discovery source options; values survive reload.
- [x] Locale tabs edit en-US and zh-CN labels per option.
- [x] Other cannot be deleted/archived away; remains available as system option.
- [x] Archived options do not appear in the public/active list used by the configurator.
- [x] Non–page-builder roles cannot mutate Forms.

## Blocked by

- [`.claude/PRD-configurator-contact-forms/issues/02-catalog-schema-validation.md`](02-catalog-schema-validation.md)

## Status

Done (2026-07-11). Prove: `npx tsx lib/discovery-source/forms-preview-contact.check.ts`
