## Parent

PRD: Partner Hub — #70

## What to build

Partner Hub settings, end to end. Profile: edit company name, logo (upload with visible guidelines — square, minimum dimensions, allowed formats), location/address, and write-up — writing directly to the partner's **Location** row (ADR 0012) so `/our-partners` and the booking picker reflect changes immediately; Staff get a notification email with a one-click hide (`visible=false`) path. **Backup email**: partner adds one backup address, verified by OTP once; it becomes a second recognised sign-in identity resolving to the same Partner account (no custom recovery bridge). Support: a WhatsApp CTA linking to the Mpillow support number.

## Acceptance criteria

- [ ] Editing write-up/logo in hub settings updates `/our-partners` (when the row is visible) with no Staff action
- [ ] Staff notification fires on profile edit; hide link flips `visible` off in one click
- [ ] Logo upload enforces/guides format constraints and renders correctly on the hub and `/our-partners`
- [ ] Backup email verified via OTP; signing in with the backup email lands in the same Partner Hub (7-day cap applies)
- [ ] WhatsApp support CTA opens a chat with the support number
- [ ] Unverified backup email is never a valid sign-in identity

## Blocked by

- #71 (backup-email sign-in also relies on the code flow from #72)
