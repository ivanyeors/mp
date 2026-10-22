# Slice 05 — Last month's reports sent on the 1st

Type: AFK
Parent: PRD `finance-reports` (`../finance-reports-prd.md`)
User stories covered: 12
Blocked by: 01; PRD open question 4 (the accountants' addresses)

## What to build

- A saved recipient list per report (Members and typed addresses) on Analytics → Reports, edited by
  holders of `analytics-reports`.
- A Vercel cron (`vercel.json`) on the 1st at 09:00 SGT that builds last month's reports and sends them
  to the saved list through `sendCustomerPurchasesReport`, audited with the system as actor.
- Skip and alert Telegram when a report fails to build; never send a partial one.

## Acceptance criteria

- [ ] Runs once per month even if the cron fires twice (keyed on report + period in the audit log).
- [ ] "Recently sent" shows the automatic send like a manual one.
