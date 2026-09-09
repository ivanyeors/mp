# Slice 10 — Sign-off: real device, both locales, production publish

Type: HITL
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: done — signed off 2026-09-09, results in `../OPS-SIGNOFF.md`
User stories covered: 57

## What to build

Human verification. Everything before this is asserted by tests and self-checks; this slice
confirms the redesign against reality — a real phone, both locales, and a real production
publish — before **Staff** are asked to trust it with the homepage.

The critical thing to prove is the one no unit test can: that a draft is genuinely invisible
to shoppers until **Publish**. Verify from a signed-out browser, not just by trusting the flag.

Checklist to work through:

**Draft isolation**
- Edit several sections; confirm from a signed-out browser (or private window) that the live
  landing page is unchanged.
- Confirm the preview shows the draft while the live page shows published content.
- Publish; confirm the live page updates and the pending-change count clears.
- Discard a draft; confirm nothing published moved.

**Bilingual**
- Set an English-only override; confirm the Chinese page shows the translated default, not the
  English string.
- Set both languages; confirm each page shows its own copy.
- Check the Shop CTA button label in Chinese.

**Preview fidelity**
- Confirm the staff dock pill and app dock are absent from the preview.
- Confirm the preview's light/dark control changes the preview only.
- Confirm the desktop preset shows a genuine desktop layout, not a widened tablet one.
- Confirm click-to-select works, and that interact mode lets the real CTAs work.

**Analytics hygiene**
- Edit for several minutes, then confirm no landing-page views from that session appear in
  journey analytics or Google Analytics.

**Real device**
- On a real phone, confirm the section list plus full-screen preview sheet is usable, that
  reordering works, and that the inspector is reachable and legible.

**Recovery**
- Publish a deliberately bad change, restore the previous snapshot, publish, and confirm the
  page is back.

Record pass/fail per item in `../OPS-SIGNOFF.md`, with the date, the device and browser used,
and any follow-up filed for a failure.

Demoable outcome: a completed sign-off checklist and a production landing page serving
published content that **Staff** published through the new builder.

## Acceptance criteria

- [x] Draft edits are confirmed invisible on the live site from a signed-out browser.
- [x] Publish is confirmed to update the live page; Discard is confirmed to leave it untouched.
- [x] An English-only override is confirmed to fall back to the translated default on the Chinese page.
- [x] Both-language overrides are confirmed to render per locale.
- [x] Preview is confirmed to hide staff chrome and to honour its own theme control.
- [x] Desktop preset is confirmed to show a real desktop layout.
- [x] Click-to-select and interact mode are both confirmed working.
- [x] An editing session is confirmed to produce no journey or Google Analytics landing-page events.
- [~] The mobile layout is confirmed usable on a real phone, including reorder and inspector.
      (Verified on desktop at a narrow viewport; physical handset pass still outstanding — see `../OPS-SIGNOFF.md` § Residual.)
- [x] Restore-from-snapshot is confirmed to recover a bad publish.
- [x] Results are recorded in `../OPS-SIGNOFF.md` with date, device and browser.
- [x] Any failure is filed as a follow-up issue rather than silently fixed in this slice.

## Blocked by

- Slices 02–09 (all AFK slices merged)
