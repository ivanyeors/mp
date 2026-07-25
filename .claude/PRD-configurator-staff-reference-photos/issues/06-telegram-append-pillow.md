# 06 — Telegram append of reference photos (pillow)

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

When a **Mpillow** response is marked final, the build team's Telegram notification carries
the staff **Reference photos** alongside the customer **Sizing photos**, in one place.

- In the existing pillow "mark final" media-group send, also fetch the session's
  `config_upload` rows and append their hosted URLs as photo items.
- Respect Telegram's 10-item media-group cap: batch into additional `sendMediaGroup` calls
  when front/side + reference images exceed 10.

## Acceptance criteria

- [ ] Marking a pillow response final sends its reference images to the Telegram group
- [ ] Existing front/side **Sizing photos** still send exactly as before
- [ ] More than 10 total images are split across multiple media-group sends (none dropped)
- [ ] No reference images → the send behaves as it does today

## Blocked by

- 02 — `config_upload` backend
