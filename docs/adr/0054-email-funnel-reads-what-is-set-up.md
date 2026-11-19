# The Email funnel is a reading of what is set up, on the Lifecycle stages, and sends nothing

Status: Accepted (PRD `email-funnel`, owner request 2026-11-18). Builds on
[ADR 0028](0028-customer-crm.md) (aftercare), [ADR 0040](0040-campaign-audiences-read-the-crm.md)
(audiences read the CRM; **Kept sending**) and
[ADR 0050](0050-continue-link-and-draft-reminders.md) (draft reminders).

## Context

The owner asked for email marketing automation designed from the funnel: per stage, the
**Segments** targeted, the logic of the emails sent, and each email's results.

The platform already sends by itself in four ways, each with its own rules: draft reminders,
**Aftercare messages**, the order and quote emails, and **Email campaigns** set to **Kept
sending**. A stage already exists on every **Customer** (the **Lifecycle stage**), every campaign
send already keeps the stage the person had (`stage_at_send`), and a **Segment** already reads
what another campaign did (`campaign=<id>:sent`).

The usual answer is a flow builder: a stored graph of triggers, waits and branches with its own
scheduler. That would be a second sender beside the claim rule, a second idea of who may be
emailed, and a third cron.

## Decision

- **(1) The funnel's stages are the Lifecycle stage**: *Lead > New > Loyal > At risk > Lost*. No
  second list of stages for email. A **Visitor** who has given no email is not on it.
- **(2) The Email funnel sends nothing and stores nothing.** It is a page that reads what is set
  up. A **Funnel step** is an **Automatic email** (one the platform already sends from the daily
  job or on an event) or an **Email campaign**. The designed programme is a list in code
  (`lib/email-funnel/programme.ts`), as **Starters** are.
- **(3) Automation is Kept sending, as ADR 0040 decided.** A person sends the first **Wave**; the
  daily job sends the rest to people who join the **Audience**. A step with more than one email is
  more than one campaign: the follow-up's Segment reads the first, and the **Rest period** spaces
  them. No branching inside a campaign, no scheduler, no new cron.
- **(4) Where a campaign sits is derived.** It belongs to the stages its Segment's `stage` filter
  names. A **Playbook**'s step is set up when a live campaign's Segment has the Playbook's
  filters and the campaign still carries the Playbook's name or subject; any other campaign to
  that Segment is Staff's own email of the stage, and the Playbook stays a suggestion. A follow-up
  whose Segment names no stage sits under the campaign it reads. No column records a campaign's
  step or stage.
- **(5) Results are by the stage the person had when sent.** A campaign's row in a stage counts
  the people at that stage when it reached them, from `email_campaign_stage_results`, with the
  campaign Results tab's rules: rates over people sent, no opens, a **Holdout** for what the
  email added. An Automatic email shows only what it already records.
- **(6) A step is Service or Marketing, and says so.** The page states which consent each step
  reads. It changes no rule: ADR 0039, ADR 0028 (f) and (h), and ADR 0050 stand.
- **(7) A Playbook's words are the owner's to approve** before it is offered
  (`APPROVED_PLAYBOOKS`). The funnel shows an unapproved one as waiting, and it cannot be started.
- **(8) Arranging the flow writes Segments, never a position** (owner, 2026-11-19). Dragging a
  draft after another email points it at the Segment that reads that email
  (`campaign=<id>:sent`), found by its filters or created; its other filters stay. Only a draft
  moves: a started campaign keeps its Audience, and a Playbook's draft keeps its Segment. (2)
  still holds: the page keeps no order of its own, and it sends nothing.

## Considered and rejected

- **A flow builder with stored graphs.** Rejected: a second sender and a second consent path
  (ADR 0040's context), for a list in the low thousands and a product bought every few years.
- **A `funnel_step` column on `email_campaigns`.** Rejected: it would have to be kept true by
  hand, and a campaign Staff wrote for a stage would be missing from the page. The Segment already
  says who the campaign is for.
- **A stored position for drag and drop.** Rejected: a number beside the Segment could say
  *second* while the Segment sent it first. The Segment is the order, so the drag edits it.
- **Stages before Lead (Visitor, Engaged) on the page.** Rejected: nothing can be emailed without
  an address, and those are counted per **Visit**, not per person (ADR 0007).
- **A period picker.** Deferred: the results view has no dates. Numbers are since each email
  started.

## Consequences

- The page can only be as right as the Segments are. A campaign sent to a Segment with no `stage`
  filter, and that reads no other campaign, appears under no stage's flow, only in the results of
  the stages it reached.
- An **Automatic email** is listed under the stage its trigger usually falls in. A draft reminder
  goes to anyone subscribed with an unfinished Draft, a past buyer included, and is listed under
  *Lead*; its numbers are not split by stage.
- Changing a threshold of the Lifecycle stage re-sorts the page with everything else.
- A new automatic email must be added to `lib/email-funnel/programme.ts` to appear; a test holds
  the programme's timings equal to the code that sends them.
