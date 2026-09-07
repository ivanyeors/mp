# Slice 08 — Real-device sign-off

Type: HITL
Parent: PRD `appointments-locations-availability`
Triage: needs-triage
User stories covered: all

## What to check (iOS Safari + Android Chrome @ ~390px, plus desktop)

- [ ] Calendar chips: one line, nothing paints outside a 60-min slot in Day / 3-day / Week / Month.
- [ ] Location dot readable on both the blue and violet fills; hollow dot for "Other".
- [ ] Phone: location strip scrolls above the folded legend; status icon hidden in Week / Month.
- [ ] Summary tiles 2×2 on a phone; Locations tile opens the gear sheet.
- [ ] Gear sheet: tab strip scrolls; day rows and window ×/add buttons ≥44px; Save reachable above the dock.
- [ ] Availability: two windows on one day render two business-hours bands; Open/Closed headers follow.
- [ ] Bookable switch: last location refuses to switch off with a toast; customer picker updates.
- [ ] Cancelled opt-in: struck-through chip appears only when the setting is on.
