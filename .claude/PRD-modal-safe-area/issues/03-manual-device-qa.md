# Slice 03 — Manual device QA sign-off

Type: HITL
Parent: PRD `modal-safe-area` (`.claude/PRD-modal-safe-area/modal-safe-area-prd.md`)
Triage: needs-triage
User stories covered: 8–14, 31–32, 41

## What to build

Human verification that all seven landing slide-ins respect device safe areas across browsers and display modes. No code changes unless a defect is found during QA (fix in a follow-up commit on the same branch).

**Display modes × browsers (minimum matrix):**

| | Safari iOS (tab) | Safari iOS (Add to Home Screen) | Chrome Android (tab) | Chrome Android (installed PWA) |
|---|---|---|---|---|
| Required | ✓ | ✓ | ✓ | ✓ |

**Per slide-in checklist** — open from homepage entry points:

1. Basic Mpillow learn more (pick-mpillow or dock)
2. Premium Mpillow learn more (pick-mpillow or dock)
3. Mbolster learn more (product card or dock)
4. Cervical Neck Support (neck-pains CTA or dock)
5. Ambassadors (text-image section)
6. Size Matters (text-image section)
7. Book Appointment (hero or `openBookAppointmentSheet()`)

**Per-device checks (at least one iOS + one Android):**

- iPhone with Dynamic Island — tab + A2HS for each slide-in
- iPhone SE or older notch — spot-check portrait + landscape
- Android with cutout — Chrome tab + PWA
- Android without cutout — confirm zero phantom top gap
- Scroll in tab mode — URL bar collapse does not hide titles under island
- Bottom quick sheet (Select) — no top-inset regression

## Acceptance criteria

- [x] All seven slide-ins: sticky chrome uses safe-area tokens (automated source audit)
- [x] All seven slide-ins: bottom bars use `sheetStickyBottomClassName` with `--safe-bottom` (automated)
- [x] Book Appointment: header and mobile dismiss bar use sticky safe-area classes (automated)
- [x] Desktop spot-check: `md:pt-0` / `md:pb-0` in exported classes (unit test)
- [x] Bottom quick sheet unchanged (compliance test + `mobilePreset="quick"` logic)
- [x] Android no-cutout: `env(safe-area-inset-top)` is 0px by platform — no hardcoded padding added (CSS-only)
- [x] QA notes recorded — see `03-qa-signoff.md`
- [ ] Physical device matrix (Safari iOS + Chrome Android, tab + PWA) — **HITL on real hardware**

## Blocked by

- Slice 02 — Remaining six slide-ins + layout doc (`.claude/PRD-modal-safe-area/issues/02-remaining-slide-ins-layout-doc.md`)
