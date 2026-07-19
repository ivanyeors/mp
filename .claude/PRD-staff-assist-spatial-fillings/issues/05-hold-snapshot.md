# Slice 05 — Filling configuration snapshot at hold create

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 10, 19, 20, 28 (fingerprint write)

## What to build

When a hold is created from a **Staff assist** session, the session's spatial mix is written to the **Result** as a full **Filling configuration** snapshot (copy of placement rows), with the fingerprint recorded. `filling_template_id` is stored only when the snapshot exactly matches the loaded catalog template; any diverging edit during the session clears it. Guest holds (no assist) create the Result with a **null** snapshot.

## Acceptance criteria

- [ ] Assist session → hold: Result carries the exact 9-cell snapshot; fingerprint row recorded
- [ ] Loaded template untouched → `filling_template_id` set; one diverging edit → cleared, snapshot intact
- [ ] Guest hold: snapshot null, everything else as today
- [ ] Snapshot is a copy — later edits to the catalog template do not change the Result
- [ ] Vitest/`*.check.ts` covering all four paths (prior art: `lib/results/__tests__/`)

## Blocked by

- Slice 04 — Staff assist chrome
