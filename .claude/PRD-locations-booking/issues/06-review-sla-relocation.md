# 06 — Review SLA relocation to /settings/general

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Move the **Result SLA reminder** ("Review SLA") config off the top of the Results page so
the table leads, without losing any SLA capability.

- Cut the Review SLA panel and its state/handlers (working days, reminder interval,
  auth-expiry buffer, Telegram/email channels, ops email, save) from the Results page.
- Mount it on `/settings/general` inside a collapsible **Review SLA** section.
- The SLA settings API is unchanged.

## Acceptance criteria

- [ ] Review SLA no longer renders on the Results page; the table is at the top
- [ ] `/settings/general` shows a collapsible Review SLA section
- [ ] All SLA fields load, edit, and save exactly as before
- [ ] No change to the SLA settings API or the reminder cron behavior

## Blocked by

None - can start immediately (but sequence after #05 to avoid conflicts on the Results page)
