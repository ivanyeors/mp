# A guest gives their email on the configurator's first question, and their Draft Result is not saved without it

Status: Accepted (PRD `guest-email-first`, owner request 2026-11-07). Amends ADR 0039: the
customisation box is now also recorded at the first question, before any hold.

## Context

The Mpillow configurators (`/mp-config`, `/mp-basic`) save a **Draft Result** from the first
keystroke, and it shows in the Admin Panel's Results straight away. The shopper's email was asked
only at the very end, on the preview's contact step, and written only by the hold or by *Save
without purchasing*. A guest who answered every question, saw their recommendation and price,
and then did not go on to Stripe left a Result Staff could see but not reach: *Request payment*
said "No customer email on file", nothing could be sent, and with no Customer there was nobody
to market to. The owner asked for a guest's email first.

Where to ask was the question. Quiz vendors report the highest opt-in when the email gate sits
after the last question and just before the result (35–55%, their own figures), and the lowest
when it sits before the first; asking first costs some people who would have started. Those
figures come from lead-magnet quizzes, though. A customised pillow is a purchase, the Results
queue is worked by hand, and the step people most often walk away from is the tape measure, which
is long before the result. Shopify's checkout puts the email first for the same reason: an
abandoned checkout can only be recovered if the email came before the abandonment.

## Decision

**A guest, on no Admin Panel login, answers "What's your email?" on the first question, beside
their name, and their Draft Result is first saved by that question's Continue, carrying the
email. Nothing is saved for them before it.**

- **Who is asked.** Anyone with no Admin Panel login (`getAdminContext()` is null): a guest, a
  signed-in Customer (prefilled from their account), a partner run, an Assist link opened on the
  customer's own device. A Staff device is not asked, an Assist link opened on one included: the
  shopper's email is asked on the contact step, as before. A reopened Result (a finish link, a
  Staff re-configuration) opens on the preview and never sees the question.
- **Where.** The first question, "Tell us about yourself" (`name`). It comes after the welcome and
  *What to expect*, so the shopper knows what they are starting, and it already asks something
  personal. One field, with one line on why: "We keep your answers under this email, so our team
  can help you finish your pillow and send your payment link." An Mbolster hand-off into Mpillow
  (the rule graph's **Flow route**), which used to skip the first question, now starts on it for a
  guest.
- **No Draft without an email.** Autosave writes nothing for a guest until the first question's
  Continue has saved the Draft with its email. A save that fails keeps them on the question
  ("We couldn't save your email…"), because a Draft without an email is the gap this closes.
- **The server writes it on a Draft only.** `POST /api/mp-config/responses` takes `draftEmail`
  and writes `customer_email` while the Result's `status` is null, behind the same access check as
  every other write to it. A held Result's email is the hold's: pointing it elsewhere would send
  that Result's emails, and the access token they carry, to someone else.
- **The same field at the end.** The contact step's email is the same state, so it arrives
  prefilled, and the hold writes whatever it says then.
- **The marketing box comes with the email (amends ADR 0039).** The checkout's box, ticked by
  default and sharing its state with the contact step's, sits under the email. It is recorded as
  `customisation`, for that email, once the Draft carrying it is saved: finding or creating the
  Customer (a *Lead*), subscribing only someone nobody has asked, and never failing the save.
  Unticked, it records nothing. It is sent on the first question's Continue only, never on an
  autosave.

## Considered options

- **Ask just before the result** (after the photos): the best opt-in in vendor data, and it
  catches everyone who sees a price. Rejected for now because it misses everyone who stops at the
  tape measure, the step most likely to send someone away to find a tape or a helper, and it
  still leaves Drafts in Results with no email. It is the fallback if the first question's
  drop-off proves costly (PRD slice 05 measures it).
- **Ask first, but let the shopper skip.** Rejected: a skippable field is skipped, and the Drafts
  it leaves behind are the problem.
- **Keep saving every Draft and only stop showing email-less ones to Staff.** Rejected: hides the
  symptom, and the shopper still gives nothing Staff can use.
- **Make the email optional on Staff devices too.** Not needed: Staff measuring in a studio have
  the customer in front of them, and the contact step asks for the email before anything is held.

## Consequences

- Every Draft Result a guest creates from now on carries `customer_email`. Drafts saved before
  this change keep theirs empty. Readers that look Results up by email (`/results`, the CRM's
  phone facts, coupon limits) already skip Drafts or read the phone, so nothing new sees them.
- A guest who leaves the box ticked is a subscribed *Lead* as soon as they pass the first
  question, so campaigns can reach people who never reached the hold. Unsubscribes from these
  addresses may run higher than from buyers; the pause rule still stops a campaign.
- Some people who would have started will not, because the email is asked before any value is
  shown. Watch the share of Visits that reach `name` and go on to `age` before and after.
- What Staff can do with a Draft is unchanged: *Request payment* still needs an assigned build,
  and finalising a Draft from Results makes it an in-store (`manual`) Result. Giving the shopper
  a link back to their own Draft, to finish and pay on any device, is the next slice of the PRD.
