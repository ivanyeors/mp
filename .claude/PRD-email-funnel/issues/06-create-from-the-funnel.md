# 06 — Create from the funnel: add an email to a stage, add a follow-up

**Type:** AFK
**Status:** **built** (2026-11-18), reviewed by the `reviewer` subagent; not yet on production
**Blocked by:** 04
**Labels:** `enhancement`, `area:email`

## Goal

A marketer adds any email to the funnel from where it belongs. The demo: on *At risk*, *Add an
email* opens New campaign with the Segment *At risk* chosen (or offered to be created) and the
Start panel open; on the campaign *We miss you*, *Add a follow-up → didn't click* opens New
campaign for the people who got *We miss you* and did not click, its Segment chosen or created.

Read first: `../email-funnel-prd.md` (Solution 5, decisions 4 and 9), slice 04's issue and its
code (`playbookSegment`, `playbookSegmentToCreate`, `startedFromParam` in
`lib/email-campaigns/starters.ts`; the notice and *Create the Segment* in `campaign-editor.tsx`;
`lib/crm/filters-key.ts`), `lib/crm/customer-filters.ts` (the `stage` and `campaign` filters),
`lib/crm/lifecycle-stage.ts`, `CONTEXT.md` → **Audience** (a campaign may not send to a Segment
chosen by what the same campaign did), **Segment**, **Email flow**.

## What to build

On `/settings/campaigns/new`, beside `?segment=` and `?starter=`:

- **`?stage=<stage>`** (`lead`, `new`, `loyal`, `at-risk`, `lost`, as the Customers `stage`
  filter writes a main stage; a sub-status or an unknown value is ignored). The campaign's
  Audience is the stage's Segment: the live Segment whose filters are exactly `stage=<stage>`
  (the same comparison slice 04 uses; one that needs review is never chosen). When there is
  none, the same notice and **Create the Segment** as slice 04, named after the stage (*Lead*,
  *New*, *Loyal*, *At risk*), through the same create. The campaign is otherwise empty and the
  Start panel is offered, so the marketer starts blank, with AI, from any Starter or a past
  campaign; choosing a Starter with its own Audience replaces the stage's, as today.
  - `?stage=lost` is refused in words: a *Lost* Customer is unsubscribed, so a campaign to the
    stage would send to nobody. The editor opens empty with that note and no Segment.
- **`?after=<campaign id>:<sent|clicked|not-clicked>`.** The Audience is the Segment whose
  filters are exactly `campaign=<id>:<did>`; when there is none, the notice and **Create the
  Segment**, named from the campaign's name and what they did (*We miss you · got it*, *· clicked
  it*, *· didn't click*; cut to the Segment name limit, and made unique if the name is taken by
  a Segment with other filters). The campaign id must be a live campaign's: an unknown or
  archived one is ignored and the ordinary empty campaign opens. `not-sent` is not accepted.
  - The parent campaign need not have started: a follow-up can be written before the first is
    sent. The notice says a follow-up goes after the Rest period, to people who match then.
- **One mechanism.** Slice 04's Playbook Segment, the stage Segment and the follow-up Segment
  are the same thing: a wanted Segment (a name and filters) that is found by its filters or
  offered to be created. Generalise slice 04's code to that rather than adding two more copies;
  its tests keep passing.
- When several of `?starter=`, `?stage=`, `?after=`, `?segment=` are given: a Starter with its
  own Audience wins; then `?after=`; then `?stage=`; then `?segment=`. Say so in a comment and
  test it.
- Nothing is saved, created or sent by opening the address.

## Acceptance criteria

- [ ] Pure tests: `?stage=at-risk` chooses a Segment with filters exactly `stage=at-risk` and
      not one with `stage=at-risk&last_order=within:24` or `stage=at-risk:lapsed`; `?stage=lost`
      chooses none and carries the note; `?stage=at-risk:lapsed` and `?stage=nope` are ignored;
      `?after=<id>:not-clicked` chooses a Segment with exactly `campaign=<id>:not-clicked`;
      `?after=<id>:not-sent`, an unknown id and an archived campaign's id are ignored; the
      precedence above.
- [ ] A test of each create path through the real route, as slice 04's: the request carries
      exactly the wanted name and filters, a second click makes no second request, a taken name
      is reported or made unique as specified and nothing is overwritten.
- [ ] A test that a campaign started from `?after=<A>:…` is not refused as "a Segment chosen by
      what the same campaign did" (it is another campaign), and that the saved campaign's
      Segment is the follow-up Segment.
- [ ] Preview screenshots, desktop and phone, of `/settings/campaigns/new?stage=at-risk` and
      `/settings/campaigns/new?after=<a sample campaign id>:not-clicked`, with the Segment
      missing (the notice) and after creating it; read and listed in the reply.
- [ ] `pnpm test lib/email-campaigns "app/[lang]/settings/campaigns" lib/crm lib/email-funnel`,
      the typecheck and eslint on the changed files pass.
