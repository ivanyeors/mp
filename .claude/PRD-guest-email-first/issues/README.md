# Guest email first — vertical slices

Breakdown of `../guest-email-first-prd.md`. Published locally (no external issue tracker).

**Triage label:** `needs-triage` (02–05)

| # | Title | Type | Status | Blocked by |
|---|-------|------|--------|------------|
| 01 | Ask a guest's email on the first question; no Draft without it | AFK | **done** (ADR 0049) | none |
| 02 | *Continue your pillow* link: the shopper reopens their own Draft on any device | AFK | needs-triage | 01 |
| 03 | Staff: send that link from a Draft in Results | AFK | needs-triage | 02 |
| 04 | Automatic reminder to a guest who stopped | HITL | needs-triage | 02 |
| 05 | Measure the first question's drop-off, and decide whether to move it | HITL | needs-triage | 01 |

## 02 — *Continue your pillow* link

A Draft has a **Result access token** from birth, but its answers live only in the browser that
typed them: a reload starts at the welcome, and another device cannot open it. Give the shopper a
link, `/{lang}/mp-config?draft={id}&token={token}` (and `/mp-basic`), that loads the Draft's
answers from the server through `authorizeResultAccess`, adopts the id and token on this device,
and opens on the preview, where they finish, choose cover, case and shipping, and pay through the
normal hold. This is what turns "Staff can reach them" into "they can pay": a *Payment request*
needs a priced, assigned build, and a Draft has neither.

Not this: finalising the Draft from Results, which makes it an in-store (`manual`) Result whose
Order is born delivered.

## 03 — Staff send the link from Results

On a Draft with an email, Results' row menu and the detail page offer *Send continue link*: a new
transactional email (*Finish your pillow*, editable under Email templates) carrying the slice 02
link, plus *Copy link* for WhatsApp. Today the menu only offers *Request payment*, greyed out.

## 04 — Automatic reminder

A daily job emails a Draft with an email and no activity for N hours, once, with the slice 02
link. Owner decisions needed: N; whether it goes to everyone or only to people who left the box
ticked (it is about their own unfinished order, but PDPA and the Spam Control Act should be read
by counsel, as for ADR 0039); and whether it stops when they book a fitting.

## 05 — Measure the cost of asking first

Compare, for 4 weeks either side of the release, the share of configurator Visits that reach the
first question and go on to `age`, and CRM metric M4 (Drafts held ÷ Drafts started; note the
denominator changes, since a Draft now starts at the first Continue). If the first question loses
materially more than it did, move the same field to just before the preview (ADR 0049's
fallback) and keep the "no Draft without an email" rule.
