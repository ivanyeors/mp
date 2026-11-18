# 02 — The programme and the model: stages, steps, flow and results, pure

**Type:** AFK
**Status:** not started
**Blocked by:** 01
**Labels:** `enhancement`, `area:email`

## Goal

Everything the Funnel page shows, computed by pure functions from plain facts, with no database
and no React. The demo is a test: given five Segments, six campaigns and their result rows,
`buildFunnel` returns, for *At risk*, two Segments, a flow of *Check-up reminder → We miss you
(keeps sending, 20 a day) → Welcome back (not set up)*, and a results row per email.

Read first: `../email-funnel-prd.md` (The programme, Solution, Decisions, Hazards), ADR 0054,
`CONTEXT.md` → Email marketing and Customer CRM, `lib/email-campaigns/starters.ts`
(`PLAYBOOK_DRAFTS`, `APPROVED_PLAYBOOKS`), `lib/email-campaigns/results.ts`,
`lib/crm/lifecycle-stage.ts`, `lib/crm/customer-filters.ts` (`customerFiltersSchema`,
`customerFilterParams`, the `stage` and `campaign` filters), `lib/crm/lifecycle-summary.ts`,
`lib/draft-reminders/index.ts`, `lib/aftercare/review-request.ts`, `lib/aftercare/checkup.ts`.

## What to build

All under `lib/email-funnel/`. No `server-only` import, no Supabase, no React.

- **`programme.ts`: the designed steps**, the table in the PRD's *The programme*, as data. Each
  step: a stable id (`lead.draft_reminders`), its stage, its kind (an **Automatic email** or a
  **Playbook**), *Service* or *Marketing* and the consent it reads, who it is for, when it goes,
  what stops it, and where it is changed (a settings path). An Automatic step names its
  `customer_emails` template ids; a Playbook step names its Starter id.
  - **Timings come from the code that sends**, never retyped: the draft reminders' days from
    `DRAFT_REMINDERS`, the Review request's days from `lib/aftercare/review-request.ts`, the
    Check-up's months from its settings (a parameter, default from `lib/aftercare/checkup.ts`),
    the At risk and Lapsed months and the Settled days from `lib/crm/lifecycle-stage.ts`, the
    Rest period from `lib/email-campaigns/rules.ts`.
  - The Check-up reminder is one step listed under *Loyal* and *At risk* (the stages a Customer
    can be in 12 months after delivery). Order, return and quote emails are one *Service* step
    each per stage, naming their templates, with no numbers.
- **A new Playbook draft, `playbook_how_its_made`**, in `lib/email-campaigns/starters.ts`
  `PLAYBOOK_DRAFTS`, for the Segment *Lead* (`stage=lead`): how a custom pillow is made for the
  person, and the two ways to start (customise online, or book a fitting). Written as the other
  four are: every claim one of `MPILLOW_FACTS` (`lib/ai/mpillow-facts.ts`), the copy rules of
  `docs/marketing-page/persona.md`, no discount, no rating or review ask, no aftercare message,
  nothing Singapore-only stated as available to everyone (**Ships to**). **Do not add it to
  `APPROVED_PLAYBOOKS`**: the owner approves the words (slice 05). Existing tests that walk
  `PLAYBOOK_DRAFTS` must still pass.
- **`model.ts`: `buildFunnel(facts): FunnelView`**, both types exported and JSON-serialisable
  (a server page passes the view to a client component). `facts` is what a loader can read:
  - the lifecycle summary (`LifecycleSummary`) and, per stage, how many are subscribed;
  - live Segments: id, name, params (the stored filter strings), count, needs review;
  - live campaigns: id, name, audience, Segment id, left-out Segment ids, locked at, keep
    sending, daily cap, paused at and reason, holdout at, people sent, first and last sent;
  - `email_campaign_stage_results` rows for those campaigns (as `resultsFromRows` reads them);
  - Automatic emails' counts by step id (sent, and the one outcome each records), any of them
    possibly missing (a failed read);
  - the switches: draft reminders, review requests, check-ups (and the check-up's months).

  The view, per stage in funnel order:
  - **Header:** label, rule (`LIFECYCLE_STAGE_RULE`), Customers, subscribed, sub-statuses.
  - **Segments:** every Segment whose `stage` filter names this stage or one of its
    sub-statuses (parse with `customerFiltersSchema`; a Segment that does not parse or needs
    review is listed, flagged, and never matched). Each with the ids and names of the campaigns
    that send to it and that leave it out. A Playbook step's Segment that no live Segment has
    the filters of is listed as *Not created* with the Playbook's name for it.
  - **Flow:** the programme's steps for the stage, then every other live campaign whose
    Segment names the stage. Each step's state:
    - Automatic: *On* / *Off in settings* from the switches; a Service step is always *On*.
    - Playbook: *Words waiting for the owner* (not in `APPROVED_PLAYBOOKS`) → *Not set up* (no
      live campaign whose Segment has the Playbook's filters; compare filters after
      `customerFiltersSchema` → `customerFilterParams`, so key order and defaults do not
      matter) → *Draft* → *Started* → *Keeps sending, n a day* → *Paused* with the reason.
      Several matching campaigns are all listed, oldest started first.
    - A campaign whose Segment has a `campaign=<id>:…` filter naming another campaign of the
      stage is that campaign's follow-up (`after: { campaignId, did }`).
    - Each step carries the link to where it is changed, and a not-set-up Playbook the address
      `/settings/campaigns/new?starter=<id>`.
    - Whether the stage shows the sunset rule (**Unengaged**): *Lead* and *At risk* only.
    - *Lost* has no steps, and says nothing is sent.
  - **Results:** one row per email with anyone sent at this stage. For campaigns: the `sent`
    cohort's numbers for this stage (`stage_at_send`), reusing `numbersFromRow` /
    `ResultNumbers`, whatever the campaign's Audience, so a campaign to everyone subscribed
    has a row in each stage it reached; flagged *one-off* or *keeps sending*. For Automatic
    steps: sent and their one outcome, or *not counted*. A stage's totals row. For *Lost*:
    campaigns by people who unsubscribed from them, most first (all stages' `unsubscribed`).
  - Rates are not stored on the view as numbers that can divide by zero: export one
    `rate(part, whole)` returning null when `whole` is 0, and use the Results tab's wording
    rules (PRD decision 5).

## Acceptance criteria

- [ ] `lib/email-funnel/__tests__/programme.test.ts`: every Playbook step's Starter id is in
      `PLAYBOOK_DRAFTS`; every Automatic step's template ids exist in `lib/email/registry.ts`;
      the draft reminder step's days equal `DRAFT_REMINDERS`' (the test fails if either side
      changes alone); every Lifecycle stage has an entry and *Lost* has no steps.
- [ ] `playbook_how_its_made` is in `PLAYBOOK_DRAFTS` and not in `PLAYBOOK_STARTERS`; a test
      says so.
- [ ] `lib/email-funnel/__tests__/model.test.ts` covers, each with a case that fails the
      plausible wrong version:
  - a Segment `stage=at-risk:lapsed` is listed under *At risk* and not under *Lead*;
    `stage=new,loyal` under both;
  - a Playbook is *set up* when the Segment's stored params are the Playbook's filters in
    another key order, and *not set up* when a filter differs (`delivered=over:30`);
  - the six states, including *Paused* carrying its reason and an unapproved Playbook never
    reading *Not set up*;
  - a campaign to everyone subscribed is in no stage's flow and in the results of exactly the
    stages its rows name;
  - a follow-up (`campaign=<id>:not-clicked`) hangs under its campaign;
  - `held_out` and `sent_since_holdout` rows are not added into a stage's sent numbers;
  - a row with stage `unknown` is in no stage; nobody sent gives null rates, not `NaN`;
  - a missing Automatic count gives *not counted*, not 0;
  - *Lost*: no steps, campaigns ordered by unsubscribes.
- [ ] `pnpm test lib/email-funnel lib/email-campaigns` and `pnpm exec tsc --noEmit -p tsconfig.json`
      (or the repo's typecheck script) pass; eslint is clean on the changed files.
