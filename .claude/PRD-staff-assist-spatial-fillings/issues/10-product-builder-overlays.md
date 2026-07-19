# Slice 10 — Product Builder: cover/case overlay mapping

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 33, 34, 35

## What to build

New Admin Panel page **Product Builder** under Landing Site: Staff map cover/case **Items** to overlay **Media Assets** (picked from the existing Media Asset Library — no new upload silo), with an optional fit transform for non-default placement on the pillow/bolster silhouette. The customisation preview reads the mapping: selecting a cover/case swaps the linked overlay on the silhouette (guests and Staff alike). Items without a mapping keep today's plain silhouette.

## Acceptance criteria

- [ ] Product Builder appears under Landing Site nav with Staff permission gating consistent with sibling pages
- [ ] Mapping an overlay to a case Item makes `/mp-config` preview show it when that case is selected; unmapped items degrade gracefully
- [ ] Overlay conforms to the silhouette (clipped by the shape path — no rectangular image slapped over the SVG)
- [ ] Mappings use Media Asset ids (count toward **Used**); removing a mapping restores the default look
- [ ] `*.check.ts` for page mount + mapping API contract

## Blocked by

None — can start immediately.
