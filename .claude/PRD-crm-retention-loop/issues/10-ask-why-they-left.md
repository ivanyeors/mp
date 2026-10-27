# 10 — Ask why they left, and close the loop

**Issue:** not filed
**Type:** AFK, then HITL (counsel on the follow-up message; the owner on the wording)
**Status:** not started
**Blocked by:** none for the on-site question; 02 for the Follow-up
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:admin`, `area:analytics`

## Goal

We know why people leave, not only where (owner, 2026-10-27: "follow up closely on enabling us
to ask them why, to close the feedback loop"). The demo: a visitor leaving the configurator
answers *Not sure about the size* and is offered *Book a fitting*; on Analytics, *Why people
leave* shows that answer as the top reason at the configurator this week.

## What to build

As set out in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md#closing-the-loop-on-drop-offs):

- **On the site.** A small, dismissable card on the configurators and checkout when the visitor
  moves to leave: on desktop the pointer leaving the page, on a phone going back or switching tab
  after they have started. Once per Visitor per 30 days. One question, the fixed options and
  *Other*, the options in a random order. Never blocks, never covers the form.
- **Help on the spot.** *Not sure about the size or feel* offers booking and chat; *Try in person*
  offers the studios; *Something did not work* asks what happened and tells Staff.
- **On the decline step.** The same question, optional, on the Result's decline confirmation.
- **After a hold ends.** One message, 2 days after a hold was released or expired without an
  Order: one question, each answer a one-tap link, no offer, once per Result. Off until counsel
  confirms it is a service message.
- **After an appointment with no purchase.** A Follow-up for the Staff member, 14 days on, with
  a reason to record. Needs customisation appointments linked to a person, which they are not
  today (`CONTEXT.md`, **Appointment**).
- **Storage.** `drop_off_reasons`: the Visit or the Result, the step, the reason, optional text,
  the time. Server-only. Anonymous answers stay anonymous.
- **Closing the loop.** A *Why people leave* card on Analytics: reasons by step and by week,
  beside the Drop-off graph. A weekly Telegram line with counts only. Each reason has an owner
  named on the card.
- **Words.** `CONTEXT.md` gains **Drop-off reason**: self-reported, apart from a **Drop-off**,
  which records where. ADR 0007 is amended to say so.

## Acceptance criteria

- [ ] A visitor sees the question at most once in 30 days, and never mid-form.
- [ ] Every answer is stored with its step; the anonymous ones carry no contact details.
- [ ] No text answer reaches Telegram.
- [ ] The follow-up message is off until counsel's answer is recorded in this file.
- [ ] Offering help never offers a discount.
