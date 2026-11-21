# Slice 09 — Clinical accuracy check and byline

Type: HITL
Parent: PRD `guides-content`
Triage: needs-triage

## What to build

- A clinical partner reads each guide for accuracy: health facts, red flags, what a pillow can and cannot do.
- Record their changes. Add the byline "Checked for accuracy by …, physiotherapist, …, our clinical partner" with the relationship disclosed, plus `reviewedBy` and `lastReviewed`.
- Confirm the wording against SCAP Appendix F, HSA GN-08 (if D2 finds a device) and the AHPC code. This is an accuracy check, not an endorsement.

## Acceptance criteria

- [ ] Reviewer's written OK and date stored in this folder.
- [ ] JSON-LD `reviewedBy` appears only on guides that were reviewed.

## Blocked by

Slices 03, 04, 05; D3
