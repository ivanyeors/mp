# Slice 06 — Admin Panel Result assign goes spatial

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 19, 20, 21, 22, 23, 24, 25, 26, 27

## What to build

The **Result** assign/edit page in the Admin Panel works on the spatial model:

- Confirming a **Filling Template** loads its placements; the operator can edit them spatially (reuse the Slice 03 cell editor component); save writes the Result snapshot (first write for guest Results)
- Divergence from the confirmed template clears `filling_template_id` on save
- Changing size×tier (or length) clears the filling pick and reloads the **Default Filling Template** hint (existing rule, now spatial)
- Shopper review shows the revised build; **Accept** and **Decline** both retain the snapshot; Stripe capture on Accept only (verify existing transitions still hold)
- Fulfillment views show both the derived pack list and the spatial placement breakdown; stock commit on approval flattens the snapshot

## Acceptance criteria

- [ ] Guest Result: operator confirms a template, tweaks one cell, saves → snapshot persisted, template id cleared
- [ ] Size×tier change clears the pick and reloads the hint (spatial)
- [ ] Accept captures and retains snapshot; Decline retains snapshot without capture
- [ ] Pack list and placement breakdown visible to fulfillment; stock commit equals the flatten
- [ ] Tests for divergence-clears-id and Decline-retains-snapshot

## Blocked by

- Slice 01 — spatial placements core
- Slice 03 — spatial cell editor (component reuse)
