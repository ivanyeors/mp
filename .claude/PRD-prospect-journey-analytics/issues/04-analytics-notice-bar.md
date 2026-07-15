# Slice 04 — Analytics notice bar

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 21, 22, 23

## What to build

Non-blocking storefront disclosure that using the site means visit data is collected to improve the experience.

- Bottom bar copy (friendly, not invasive) + link to privacy policy
- **Got it** dismiss persisted (cookie or localStorage)
- Does not block browsing; does not offer Reject; collection already on from slice 02
- Privacy policy touch-up if needed to mention visit analytics

## Acceptance criteria

- [x] Notice appears for first-time storefront visitors and dismisses with Got it
- [x] Dismissed state does not reappear every Visit
- [x] Notice never blocks configurator or checkout interaction

## Blocked by

- Slice 02 — Page-view tracer

## Status / proof

Shipped `AnalyticsNoticeBar` next to `JourneyTracker` in `app/layout.tsx`.

- Gate: `isAdminJourneyPath` — never mounts UI on `/settings/*`
- Persist: `localStorage` key `mp_analytics_notice_ok`
- Layout: `pointer-events-none` wrapper + `pointer-events-auto` bar only (not a modal); z-40 below AppDock
- Privacy: `/privacy-policy` linked; policy sections 3/4/7 mention first-party visit analytics
- Check: `npx tsx components/analytics/analytics-notice-bar.check.ts`
