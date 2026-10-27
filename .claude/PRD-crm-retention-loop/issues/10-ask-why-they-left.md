# 10 — Ask why they left, and close the loop

**Issue:** see the README table
**Type:** part 1 AFK; part 2 HITL (counsel on the follow-up message, the owner on the wording)
**Status:** part 1 built on `claude/crm-loop-handoffs-dropoff` (migration `20261027120000_drop_off_reasons.sql` to apply to production); part 2 not started
**Blocked by:** part 1 none; part 2 counsel, and customisation appointments linked to a person
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

We know why people leave, not only where (owner, 2026-10-27: "follow up closely on enabling us
to ask them why, to close the feedback loop"). The demo: a visitor leaving the configurator
answers *Not sure about the size or feel* and is offered a fitting or a chat; on Analytics,
*Why people leave* shows that answer by step and by week.

Defined in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md#closing-the-loop-on-drop-offs).

## Part 1: what this build adds

- **The question on the site.** On the configurators (`/mp-config`, `/mp-basic`,
  `/mbolster-config`) and checkout (`/shop/checkout`), a small, dismissable card asks *"What
  stopped you today?"*:
  - **When:** only after the visitor has started (20 seconds on the page and a tap, click or
    key), then either the pointer leaves the top of the window (desktop) or 60 seconds pass with
    no activity (any device). Never while a field has focus, and never while Staff edit a Result
    in the configurator (`?edit=1`). Moving to another page closes it; an answer already picked
    is still recorded, filed on the page that asked.
  - **How often:** once per browser per 30 days, whichever step asked.
  - **Answers**, in a random order with *Other* last: *Not sure about the size or feel*, *I want
    to try it in person first*, *The price*, *Delivery cost or time*, *Something did not work*,
    *Just looking for now*, *Other*. *Something did not work* and *Other* take an optional line
    of text, up to 500 characters.
- **Help on the spot**, after an answer: size or feel offers *Chat with us* and *Book a fitting*;
  in person offers *See our studios and book*; delivery links the delivery policy; the rest say
  thank you. No answer offers a discount.
- **On the decline step.** The Result's *Decline this build?* dialog asks the same question,
  optional, with the decline-specific answers (*I changed my mind about the build* in place of
  *Just looking*). The answer travels with the decline and is stored only if the decline succeeds.
- **Storage.** `drop_off_reasons` (server-only: RLS on, no policy, nothing granted to `anon` or
  `authenticated`): step, reason, optional text, the page path, the Visit and Visitor ids from the
  journey tracker when present, the Result for a decline, the time. One answer per Visit per step.
  `POST /api/analytics/drop-off-reason` takes JSON only, validates with zod, checks the page
  against the step, and allows six answers an hour per address, counted across instances.
- **Closing the loop.** A *Why people leave* card on Analytics (`analytics`): answers by step and
  reason for the last 30, 90 or 365 days, a weekly count, the area each reason points to, and the
  latest typed answers. Text answers are shown to Staff only.
- **Words.** `CONTEXT.md` gains **Drop-off reason**: self-reported, kept apart from a
  **Drop-off**, which records where. ADR 0007 gains an amendment saying so.

## Part 2: later

- After a hold is released or expires without an Order: one message 2 days later, one-tap
  answers, no offer, once per Result. Off until counsel confirms it is a service message.
- After a customisation appointment with no purchase in 14 days: a Follow-up with a reason to
  record. Needs customisation appointments linked to a person (`CONTEXT.md`, **Appointment**).
- A weekly Telegram line with counts only, chained onto `results-sla`.

## Acceptance criteria (part 1)

- [ ] A browser sees the question at most once in 30 days, never before the visitor has started,
  never while a field has focus, and never on Admin Panel pages.
- [ ] Every answer is stored with its step and carries no contact details; the card promises only
  that it asks for no name or email.
- [ ] A second answer for the same Visit and step is ignored, not an error.
- [ ] The endpoint refuses an unknown step or reason, text over 500 characters, and floods.
- [ ] A decline with a reason stores it; a decline that fails stores nothing; a decline without
  one behaves exactly as before.
- [ ] Offering help never offers a discount.
