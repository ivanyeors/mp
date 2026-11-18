# 04 — Set up a step: New campaign from a Playbook, with its Segment

**Type:** AFK
**Status:** not started
**Blocked by:** 02
**Labels:** `enhancement`, `area:email`

## Goal

A Playbook step that is *Not set up* is one click from a campaign ready to check and send. The
demo: open `/settings/campaigns/new?starter=playbook_we_miss_you` where no Segment *At risk · 12
to 24 months* exists; the editor opens with the Playbook's words and blocks, says its Segment
does not exist yet, and *Create the Segment* makes it and chooses it.

Read first: `../email-funnel-prd.md` (Solution 5, Decision 7),
`app/[lang]/settings/campaigns/new/page.tsx`, `campaign-editor.tsx` (how a Starter is applied:
`startedFrom`, `starterAudience`), `lib/email-campaigns/rules.ts` (`newCampaignDraft`),
`lib/email-campaigns/starters.ts`, `lib/crm/segments.ts` and
`app/api/settings/customers/segments/route.ts` (how a Segment is created, and with which
permission), `.claude/PRD-crm-retention-loop/issues/07-stage-playbooks.md`.

## What to build

- **`?starter=<id>` on New campaign.** A Starter id that is offered (`starterById`, so an
  unapproved Playbook is not: it opens the ordinary empty campaign) starts the campaign from
  it, exactly as choosing it in the Start panel does: same words, blocks, Audience and
  *Include unengaged*. An unknown id is ignored. `?segment=` keeps working, and when both are
  given the Starter's own Audience wins only if the Starter has one.
- **The Playbook's Segment.** The Segment is found by its filters first (the same comparison
  slice 02 uses for *set up*: `customerFiltersSchema` → `customerFilterParams`), then by its
  name, so a Segment renamed by Staff is still found. Today's match is by exact name only
  (`starterAudience`): keep the Start panel and the palette on the same rule as `?starter=`.
- **When there is none**, the editor says so beside the Audience: *This Playbook sends to the
  Segment "At risk · 12 to 24 months", which doesn't exist yet*, with **Create the Segment**
  for Staff who may create Segments (the permission the existing create uses), and for others
  who to ask. Creating it goes through the existing create (its validation, its unique-name
  rule, its audit row), with the Playbook's name and filters, then selects it. A name already
  taken by a Segment with other filters is reported, not overwritten.
- Nothing is saved or sent by opening the address: the campaign is a draft in the editor until
  Staff press Save.

## Acceptance criteria

- [ ] Tests (pure, beside `starters.ts` / `rules.ts`): `?starter=playbook_second_purchase` gives
      the same draft as the Start panel's choice; an unknown id and an unapproved Playbook's id
      give the empty draft; a Segment with the Playbook's filters under another name is chosen;
      a Segment with the Playbook's name and other filters is **not** chosen.
- [ ] A test of the create path: the Segment is created with the Playbook's exact filters
      (`includeUnengaged` is the campaign's, not a Segment filter), and a second click does not
      create a second one.
- [ ] `.claude/skills/preview/preview shoot "/settings/campaigns/new?starter=playbook_we_miss_you"`
      at desktop and phone width, in a scenario or with fixtures where the Segment is missing
      (the notice shows) and where it exists (the Segment is chosen); screenshots read and
      listed in the reply.
- [ ] `pnpm test lib/email-campaigns "app/[lang]/settings/campaigns" lib/crm`, the typecheck and
      eslint on the changed files pass.
