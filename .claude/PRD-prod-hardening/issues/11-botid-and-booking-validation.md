# 11: BotID on booking, Result hold and checkout; a booking must be a real slot

**Type:** AFK
**Blocked by:** 10 (#176) (the Pro plan; BotID deep analysis and Firewall layering)
**User stories:** 30, 31
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:storefront`

## Goal

Automated traffic is refused before any side effect, and a human can only book an **Appointment** slot the calendar actually offers.

## The gap, precisely

**Booking takes any time range.** `app/api/appointments/book/route.ts`:
- `:41-45` only checks `startMs < endMs`: no future check, no slot-grid alignment, no duration check, no availability window.
- One request with `end_iso` years ahead makes `freeBusy` report every slot taken, blocking the calendar.
- `:88` `createEvent` with `sendUpdates=all` (`lib/appointments/calendar.ts:477`) sends a Google invite from the shop account to any `email`, with `guest_name` (200 characters) in the title.
- `:116-118` sends a paid WhatsApp template to any number that `lib/appointments/phone.ts:32-34` accepts (`/^\+\d{8,15}$/`).
- `:99` creates `appointment_reminders` rows that the cron messages later, and `:136` writes a Google contact.

**The slot rules already exist.** `lib/appointments/slots.ts:~87-120` generates slots from per-weekday availability windows, `durationMinutes` and lookahead, and `app/api/appointments/slots` uses it.

**No bot check anywhere.** No BotID, Turnstile or reCAPTCHA in the repo.

## Scope

- **Booking must be a real slot.** Before any Google, WhatsApp or DB side effect, generate the slots for the requested date, location and type with the existing slot generator. The requested `start_iso` and `end_iso` must equal one of them exactly; otherwise 400. Reuse the function; don't add a second rule set.
- **BotID:**
  - Install `botid` (already in the Vercel ecosystem, no new vendor).
  - Wrap the Next config with `withBotId`.
  - Call `initBotId` on the client with protected routes `/api/appointments/book`, `/api/results/hold` and `/api/shop/checkout`.
  - In each of those three routes, `const { isBot } = await checkBotId(); if (isBot) return 403` as the first step.
- **Name cap:** `guest_name` shrinks to a sane length (for example 80) in the book schema.

## Acceptance criteria

- [ ] vitest: booking with a start in the past returns 400.
- [ ] vitest: booking with an off-grid start (for example :07) returns 400.
- [ ] vitest: booking with `end - start` not equal to the configured duration returns 400.
- [ ] vitest: in each of those rejections, the calendar, WhatsApp and contacts mocks were never called. Fails on today's code.
- [ ] vitest: an on-grid future slot still books.
- [ ] vitest: `checkBotId` mocked to `isBot: true` gives 403 on all three routes, with no side-effect mocks called.
- [ ] On preview, a real browser can book, submit a Result hold and reach Stripe checkout; BotID doesn't block humans.
- [ ] `curl` without the BotID client headers gets 403 on the three routes in production mode.
