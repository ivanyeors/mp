# 09 — Staff at the visit, and the customer's way in from their order

**Type:** AFK
**Blocked by:** 08
**User stories:** 20, 21, 22, 23
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:appointments`

## Goal

**Staff** open today's calendar and, without asking the customer anything, can see for each re-adjustment:

- which pillow it is and its order;
- when it was bought;
- whether the visit is free, paid, or needs a proof-of-purchase check.

After the visit they tap **Attended** or **No-show**.

Customers can start a re-adjustment from the pillow on their order page instead of hunting for the booking page.

## Scope

### Admin Panel — Appointments calendar

- **The chip** keeps its type icon and RSVP channel (`components/settings/appointments-calendar.tsx:214`; CONTEXT **Appointment RSVP status**). Add a small fee marker: none for complimentary, `$` for paid, `?` for not listed. Explain all three in the legend.
- **The event-detail sheet:** when the event's private property carries `readjustment_booking_id`, load the booking (service role, `requireAdmin("appointments")`) and show a **Re-adjustment** panel:
  - *Premium Mpillow · Size M* · *Order #1042* (link to **Order** detail) · *bought 3 Sep 2026*
  - one of **Complimentary** · **Paid $30** (link to the service **Order**) · **Not listed — check proof of purchase** (where bought, reference)
  - **Mark attended** → booking `attended`. If there is a service **Order**, set it `delivered` with `delivered_at` (service rendered), and record an **Order** timeline event.
  - **No-show** → booking `no_show`. A complimentary visit stays used. The panel says so: *"Cancel instead to give the free visit back."*
  - **Cancel booking** → booking `cancelled`, event cancelled through the existing cancel path. A paid booking shows *"Refund from the Order if appropriate"* with a link. Refunds are deliberately not automatic (PRD non-goals).
  - Every action goes through `recordAdminAction`.
- **`needs_reschedule`** bookings (slice 08) show as a banner at the top of the calendar until a **Staff** member reschedules or cancels them.

### Customer — account order page

On `app/[lang]/account/orders/[orderNumber]/page.tsx`, each pillow or bolster line gets **Book a re-adjustment**, next to RMA's actions (`rma-actions.tsx`).

- **Badge:** the same quote as the picker (*Complimentary until 12 Dec* / *$30*).
- **Link:** `/[lang]/appointments?type=readjustment&item=<order_item_id>`.
- **Existing bookings:** a line with an upcoming booking shows it instead (*Re-adjustment booked · Fri 14 Nov, 2:30 PM*).

### Customer — confirmation and Profile

- **Account Profile** (`app/[lang]/account/page.tsx`): an *Upcoming re-adjustment* card when one exists. No new nav item; the booking is reachable from the order.

## Acceptance criteria

- [ ] A complimentary, a paid and an unlisted booking each render the right panel and chip marker in the **Admin Panel** calendar.
- [ ] **Mark attended** on a paid booking sets the booking `attended` and its service **Order** `delivered`. On a complimentary one it sets only the booking.
- [ ] **No-show** keeps the free visit used. **Cancel booking** gives it back (re-quote shows *Complimentary*).
- [ ] Every action writes one Audit Log entry. A role without `appointments` gets 403 from the action routes.
- [ ] A `needs_reschedule` booking shows the banner until resolved.
- [ ] The account order page shows **Book a re-adjustment** with the correct badge on pillow and bolster lines only (not accessories, not service lines), and deep-links with `?item=` preselected.
- [ ] A line with an upcoming booking shows the booking instead of the button.
