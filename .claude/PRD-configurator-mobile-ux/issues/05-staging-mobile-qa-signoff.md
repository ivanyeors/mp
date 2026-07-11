# Slice 05 — Staging mobile QA signoff

Type: HITL
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: needs-triage
User stories covered: 46–47, 49–50

## What to build

Human staging / device sign-off checklist for both configurators after slices 01–04. No new product features — verify end-to-end mobile UX and cancel restore; spot-check desktop unchanged chrome where specified.

## Acceptance criteria

- [ ] Mpillow full (mobile): option rows for gender/age/BP/firmness; Customise CTA; hybrid validation errors; bottom Close + centered exit dialog; solid bg after Get Started; tighter padding.
- [ ] Mpillow basic (mobile): same chrome/validation patterns; Continue CTA; cancel restore to preview.
- [ ] Mbolster (mobile): shared chrome (Close, bg, padding, exit dialog); no new demographic questions; Continue; cancel restore to preview.
- [ ] Multi-select pills and Cover Style picker still behave as before (not redesigned).
- [ ] Desktop: option rows present; bg effects and toast exit still as pre-PRD for those concerns; Stripe cancel still restores preview.
- [ ] Stripe Checkout itself unchanged aside from return-to-preview behavior.
- [ ] Sign-off notes recorded (device/browser matrix: at least one iOS Safari and one Android Chrome).

## Blocked by

- [01-single-select-rows-cta-copy.md](./01-single-select-rows-cta-copy.md)
- [02-mobile-chrome-close-bg-padding.md](./02-mobile-chrome-close-bg-padding.md)
- [03-step-validation-field-errors.md](./03-step-validation-field-errors.md)
- [04-stripe-cancel-restore-preview.md](./04-stripe-cancel-restore-preview.md)
