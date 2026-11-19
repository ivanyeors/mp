# 07 — Arrange the flow: a sequence you can drag, slot into and build as drafts

**Type:** AFK
**Status:** **built** (2026-11-19), reviewed by the `reviewer` subagent
**Blocked by:** 03, 06
**Labels:** `enhancement`, `area:email`

Owner, 2026-11-19: *"Don't send out any emails, you can build the draft, we will send out later.
Improve on the email flow UI better, regarding UX, improve the design to be able to slot in, swap
the emails send order easily too with drag and drop."*

## Goal

A marketer builds a stage's emails as drafts and puts them in the order people get them, by
dragging. The demo, on *Lead* with nothing started: **Add as a draft** on a Suggested Playbook
puts its draft in the flow; **Add an email** twice makes two more drafts; dragging the third above
the second swaps them; the **+** between the first and second opens New campaign and the saved
email lands between them. Nothing on this page or in this slice sends an email.

Read first: `../email-funnel-prd.md` (decisions 3, 4, 8, 9, 10), ADR 0054 (decision 8),
`CONTEXT.md` → **Email flow**, **Segment**, **Audience**, **Kept sending**, **Rest period**;
`lib/email-funnel/model.ts` (`readsOf`, `followOf`, cycle roots, `FlowStep.after`);
`lib/email-campaigns/wanted-segment.ts`; `lib/crm/segments.ts` (`createSegment`, its permission
and audit); `app/[lang]/settings/campaigns/actions.ts` (`saveCampaign`, `audienceRefusal`);
the funnel page (`app/[lang]/settings/campaigns/funnel/`); `components/ui/sortable-row.tsx` and
`components/settings/page-builder/section-tree.tsx` for how `@dnd-kit/react` is used here.

## The rule that makes order real

Send order is not a stored position. **B is sent after A when B's Segment reads A**
(`campaign=<A>:sent|clicked|not-clicked`), and the **Rest period** spaces them. So:

- **Moving a campaign changes only the *Campaign* filter of its Segment.** Its other filters
  (its `stage` filter above all) stay. Placed after P with condition `did`: its filters with
  `campaign=<P>:<did>`. Placed at the start of a stage (follows nothing): its filters without
  `campaign`; if that leaves no filters, or it had no Segment (another Audience), `stage=<stage>`.
- The campaign is then pointed at the live Segment with exactly those filters (`filtersKey`), or
  one is created through `createSegment` (its permission, validation, unique name, audit row).
  A Segment is never edited in place: other campaigns may send to it.
- **Only a draft moves** (`lockedAt` null; checked again in the write, `locked_at is null`). A
  campaign whose first Wave was planned keeps its Audience, as `saveCampaign` already holds.
- **A Playbook's draft does not move.** Its Segment is what makes it the Playbook (decision 3):
  it starts its own sequence, and emails are added or dragged after it.
- **List semantics.** Moving D closes the gap it leaves: D's draft follow-ups now follow what D
  followed (same condition each had), or start the stage if D followed nothing. A started
  follow-up of D cannot be re-pointed, so it stays under D. Dropping D **between** P and its draft
  follow-up C: D takes C's place (follows P with C's condition) and C follows D (*got it*).
  Dropping D after P where nothing can be re-pointed: D becomes another follow-up of P (*got it*).
- Refused, in words: a move that would make D follow itself or one of the emails still under it;
  a target that is archived or not in this stage's flow; a campaign whose Segment needs review or
  cannot be read; a Segment that must be created by someone without the permission to create one.

## What to build

### 1. The plan, pure — `lib/email-funnel/move.ts`

`planMove(facts, move)`: from the live campaigns and Segments (the facts `buildFunnel` reads) and
`{ campaignId, stage, after: { campaignId, did } | null, before: campaignId | null }`, the list of
changes `{ campaignId, campaign: { id, did } | null }` (each campaign's new *Campaign* filter), in
an order where no intermediate state is a cycle, or a refusal with its words. No I/O. It uses the
model's own reading of who follows whom, so the page and the plan cannot disagree.

Tests (each fails on the plausible wrong version): swap two drafts of a chain; move the first of a
chain to its end (the second becomes the start, with `stage=<stage>` when it had only a campaign
filter); slot between P and draft C; drop after P whose follow-up is started (becomes a sibling);
a started campaign refused; a Playbook's draft refused; D onto its own started follow-up refused;
the `stage` filter and any other filter survive a move; `did` kept for re-pointed follow-ups.

### 2. The write — `moveFunnelEmail` in `funnel/arrange-actions.ts`

Its own file: `funnel/actions.ts` renders emails, so it reaches the sender's code. Guarded by
`campaigns`. Input is ids, a stage and a condition only (never filters: the action must
not answer questions about Segments, see slice 06's finding). It loads fresh facts, plans, then for
each change finds or creates the Segment and updates the campaign (`audience: "segment"`,
`segment_id`), refusing through `audienceRefusal`, with an `email_campaign.update` audit row per
campaign. Segment names: `<stage label> · <did> “<parent name>”` in the pattern of
`followUpWanted` (cut to the limit, made unique); a start-of-stage Segment with only a stage is
the stage's (*Lead*). Creating needs the Segments' own permission; without it, the refusal says who
can. Changes are applied one by one — `ponytail:` no transaction over PostgREST; a failure part-way
leaves a valid arrangement, the page re-reads and says which email did not move.

It plans no Wave, changes no *Keep sending*, and imports nothing from the sending code. A test
asserts the action's module graph does not reach `send-flow`, `sender` or `keep-sending-run`.

### 3. Slot a new email in — `?before=<campaign id>` on New campaign

`/settings/campaigns/new?after=<P>:<did>&before=<C>`: as `?after=` today, and on the first save, C
(a draft that follows P) is moved to follow the new campaign (*got it*) by the same plan and
write. If that move is refused the campaign is still saved and the editor says C did not move.
`before` without a valid `after`, or naming a started campaign, is ignored.

### 4. Build a draft in one click — **Add as a draft**

On a Suggested card (an approved Playbook, *Not set up*): **Add as a draft** creates the campaign
from `starterDraft`, pointed at the Playbook's Segment (found, or created), saved as a draft. It
plans no Wave. The card becomes the Playbook's Draft card. **Start from this** (opens the editor)
stays as the second action. A Playbook whose words wait for the owner offers neither (decision 7).

### 5. The Email flow, redesigned

Today the flow runs left to right, wraps, and hangs follow-ups below; every card carries three
follow-up links. Replace it with **one column read top to bottom**, the same on a phone:

- **Enters** at the top, **Leaves** at the bottom, a rail between them.
- **Automatic emails** first: compact fixed rows with a lock and *Automatic*, their timing and
  state. Not draggable; they never take a drop.
- **Sequences.** Each email that follows nothing starts a sequence; its follow-ups run under it
  in order, numbered 1, 2, 3. An email with more than one follow-up shows them as labelled
  branches (*clicked it*, *didn't click*), indented, each numbered on.
- **A card** is one row: grip, step number, thumbnail (the real render, as now), name and subject,
  state, Segment, its numbers once started, and one **⋯** menu (Open, Preview, Add a follow-up,
  Move earlier, Move later, Start a new sequence). The whole card still opens the preview.
- **A chevron on each card shows or hides its preview** (owner, 2026-11-19). Hidden, the card is
  one compact line; shown, the email's real render opens with it. *Show previews / Hide previews*
  at the top of the flow sets them all; shown by default, the choice kept per browser. A card
  being dragged is always the compact line.
- **Between two cards**: the condition and the wait (*7 days or more after · to those who got it*).
  For a draft the condition is a control (*got it / clicked it / didn't click*) that re-points it
  through `moveFunnelEmail`. A **+** sits on every connector: *Add an email here* (item 3) where
  the next email is a draft, *Add a follow-up* otherwise, and at the end of every sequence.
- **Drag and drop** (`@dnd-kit/react`, already a dependency): a draft is dragged by its grip, by
  pointer, touch or keyboard. Drop zones open between cards, at the end of each sequence and at
  *Start a new sequence*. The dragged card leaves a placeholder; the zone under the pointer shows
  what will happen in words (*After “Welcome back”, to those who got it*). A started card has a
  lock in place of the grip and a tooltip saying why it stays. The move is optimistic, rolls back
  on refusal with the refusal's words in a toast, and the page re-reads after.
- **Every move also works without dragging** (the menu items, focusable, announced by a live
  region): drag and drop is never the only way.
- **Drafts not in the funnel yet**: under the sequences, a compact strip of live drafts that sit
  in no stage (no Segment, or one that names no stage and reads no campaign). Each can be dragged
  into a zone or placed with *Add to this stage*. The model exposes them; no thumbnails needed.
- **Add an email** stays at the end, as *Start a new sequence*'s companion; Suggested Playbooks
  stay dashed cards among the sequences.
- A person with `campaigns` but without the Segments' permission sees the flow with no grips, no
  move items, no condition control and no *Add an email here*: the browser cannot know which
  moves would need a new Segment without learning Segment filters. The plain *Add a follow-up*
  **+** stays, as slice 06 offers it; New campaign handles a Segment that has to be made.
- **Move to…** in each movable card's menu and on each draft outside the funnel lists every place
  a drop would accept, in the drop zones' own words, so no move needs a drag.

## Done when

- [ ] `planMove` tests pass, each case above.
- [ ] `moveFunnelEmail` tests: guarded; a started campaign refused server-side even when the
      client says draft; a Segment found by filters is reused, not duplicated; one created when
      missing; the audit rows; no import path to the sending code.
- [ ] `?before=` test: the saved campaign sits between P and C; a refused move still saves.
- [ ] *Add as a draft* test: a draft exists with the Playbook's Segment and no Wave.
- [ ] Component tests: a started card has no grip; menu *Move earlier* calls the action with the
      same input a drop would; a refusal rolls the card back and shows the words.
- [ ] `.claude/skills/preview/fixtures/crm.mjs` gives *Lead* and *At risk* at least three drafts in
      a chain, a started follow-up and one draft outside the funnel; preview shots of both stages
      at desktop and phone, read, with no horizontal scroll on the phone.
- [ ] `pnpm test` for the touched folders, `pnpm typecheck`, eslint on changed files.
- [ ] No migration, no cron, no change to any file under the sending path.
