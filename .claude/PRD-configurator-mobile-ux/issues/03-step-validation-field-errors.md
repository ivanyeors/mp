# Slice 03 — Step validation + field errors

Type: AFK
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: needs-triage
User stories covered: 24–31, 44

## What to build

Hybrid CTA enablement and submit-time field errors across Mpillow and Mbolster wizard steps and preview authorize:

- Primary CTA **disabled** until the current step has some input.
- Once partially filled, CTA is tappable; tap validates **all** required fields for that step.
- Incomplete/invalid fields show inline error state (including single-select option-row groups from slice 01); scroll/focus toward first error when useful.
- Errors clear as each field becomes valid.
- Preview authorize: highlight missing cover, case, email, shipping (and other required hold-prep fields) instead of toast-only feedback.

Extract a small validation helper with an automated check (enablement rules + error map for a sample step).

## Acceptance criteria

- [ ] Empty step: primary CTA disabled.
- [ ] Partially filled step: CTA enabled; submit with missing required fields shows per-field errors.
- [ ] Fixing a field clears that field’s error without requiring a full remount.
- [ ] Option-row questions support error styling (group + helper text).
- [ ] Mbolster height / sleep-position steps follow the same hybrid + error pattern.
- [ ] Preview authorize surfaces field-level errors for missing required hold-prep inputs.
- [ ] Automated test/check covers validation helper behavior (not full React trees).

## Blocked by

- [01-single-select-rows-cta-copy.md](./01-single-select-rows-cta-copy.md) — option rows must exist to attach error styling for those questions.
