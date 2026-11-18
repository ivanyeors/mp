# 03 — The Funnel page: stage strip, Segments, Email flow, Results

**Type:** AFK
**Status:** not started
**Blocked by:** 02
**Labels:** `enhancement`, `area:email`

> **Owner direction, 2026-11-18 (overrides the wording below where they differ):** the page is a
> marketer's workspace. The stage strip is a funnel graphic (tapering bands sized by Customers).
> The Email flow is a canvas of cards, each carrying a thumbnail of the email from the real
> renderer, opening a full preview (desktop / phone, light / dark). Each stage ends with *Add an
> email* (`/settings/campaigns/new?stage=<stage>`), each campaign has *Add a follow-up*
> (`/settings/campaigns/new?after=<id>:<sent|clicked|not-clicked>`), and a Playbook not started
> is a dashed *Suggested* card. See the PRD's Solution 1, 3 and 5 and decision 9.

## Goal

**Admin Panel → Email campaigns → Funnel** shows the five stages; choosing one shows the
Segments that cut it, its Email flow and each email's results. The demo: open
`/settings/campaigns/funnel?stage=at-risk` on the preview's sample data, on a desktop and a
phone.

Read first: `../email-funnel-prd.md` (Solution, Decisions 5 and 6, Hazards), slice 02's
`lib/email-funnel/model.ts`, `.claude/skills/preview/SKILL.md`,
`app/[lang]/settings/customers/page.tsx` and `lifecycle-card.tsx` (how a settings page loads and
how stages are coloured), `app/[lang]/settings/campaigns/results-panel.tsx` (the results
wording), `components/settings/settings-sidebar-nav.tsx`, `lib/auth/permissions.ts`.

## What to build

- **The loader**, `lib/email-funnel/server.ts`: `getEmailFunnel(): Promise<FunnelView>`, reading
  with `supabaseAdmin()` and calling `buildFunnel`. It reads: the lifecycle counts
  (`getLifecycleSummary`), subscribed per stage (a `head: true` count through
  `countCustomers` / `applyCustomerFilters`), `listSegments`, `listCampaigns`, every row of
  `email_campaign_stage_results`, the aftercare and draft-reminder switches, and the Automatic
  emails' counts:
  - sent per template from `customer_emails` (`status = 'sent'`), `head: true`;
  - Review request: asked, link opened (`customer_review_requests`, `head: true` counts) and
    reviews linked (`countLinkedGoogleReviewsOfRequested`);
  - Check-up reminder: sent and followed by a booking (`countCheckupSends`, all time; if it
    reads rows, page them);
  - draft reminders: sent per reminder, and Drafts reminded that were finished afterwards
    (the Draft `entity_id` now held, assigned or bought, by the rule `lib/draft-reminders`
    uses for *went on to buy*), paging to the end.
  - **Every read pages to the end or is a head count** (PostgREST returns at most 1,000 rows).
  - A failed read of one part leaves that part *not counted* (slice 02), logged, and never
    fails the page. Nothing that names a Customer leaves the loader.
- **The page**, `app/[lang]/settings/campaigns/funnel/page.tsx` (server, `runtime = "nodejs"`,
  `requireAdminPage("campaigns", locale)`) and a client component beside it. English, as every
  Admin Panel page. Links to Customers show only with `customers`.
  - **Stage strip:** the five stages in order as a funnel a person can read at a glance, each
    with Customers and subscribed, coloured as the Customer lifecycle chart colours them
    (`LIFECYCLE_PALETTE_CLASS`). The chosen stage is `?stage=` (hyphenated, as the Customers
    filter writes it; default *Lead*; an unknown value falls back). Keyboard reachable, the
    chosen one announced (`aria-current` or tabs).
  - **Segments:** name, filter chips (reuse the Customers page's chip labels), live count, the
    emails that send to it, *leaves out* notes, *Open in Customers*, *Email this Segment*
    (`/settings/campaigns/new?segment=<id>`). *Not created* Segments are listed plainly.
  - **Email flow:** an ordered list with connectors, not a canvas (no `@xyflow`): the entry
    (who is in the stage, from the rule), then each step as a card with what it waits for, a
    *Service* / *Marketing* mark and the consent it reads, its state, and its link. Follow-ups
    indented under their campaign. A *Rest period* connector between two marketing steps. The
    exits last: what moves someone to the next stage, unsubscribing (*Lost*), and the sunset
    rule where it applies. It must read top to bottom on a phone with no horizontal scroll.
  - **Results:** a table on desktop, stacked cards on a phone: email, kind, sent, clicked,
    unsubscribed, marked as spam, bought within 30 days (people, rate, S$), and for an
    Automatic email its own outcome. Rates over people sent, a dash when nobody was, the
    still-counting note, no "conversions" and no opens (`CONTEXT.md` → Bought after a
    campaign). A line under the title says the numbers are since each email started and are by
    the stage people had when sent. Each campaign row links to its Results tab.
  - **Empty states:** a stage with no Segments, no campaigns, nothing sent; *Lost*.
  - A `ponytail:` comment where the period picker would go (PRD decision 6).
- **Navigation:** *Funnel* under Email campaigns in the CRM group, before Email templates,
  shown with `campaigns`. Confirm `permissionForHref("/settings/campaigns/funnel")` is
  `campaigns`, and that the Campaigns / Templates switch on those pages gains *Funnel* if it is
  a shared component.
- **Preview sample data:** the fixtures gain what the loader reads and the sample campaigns
  cover every state: one Playbook keeping sending, one paused, one started, one draft, one not
  set up, a one-off to everyone subscribed, a follow-up, and Automatic counts. A preview run
  must list no read without sample data for this page.

## Acceptance criteria

- [ ] `.claude/skills/preview/preview shoot "/settings/campaigns/funnel" "/settings/campaigns/funnel?stage=new" "/settings/campaigns/funnel?stage=at-risk" "/settings/campaigns/funnel?stage=lost"`
      produces desktop and phone screenshots; each is read; the reply lists their paths. None
      shows a Customer's name or email, an overflowing row, or a horizontal scroll on the phone.
- [ ] A loader test with a fake client: a `customer_emails` read of 1,500 sample rows counts
      1,500, not 1,000; one failing read gives *not counted* for that step and the rest of the
      view intact.
- [ ] A test that the page's results cells use `rate()` and render a dash for nobody sent (a
      component or formatter test, whichever the page's code makes natural).
- [ ] `permissionForHref("/settings/campaigns/funnel") === "campaigns"`, asserted in a test, and
      the nav item is present in `NAV_GROUPS` under Email campaigns.
- [ ] `pnpm test lib/email-funnel "app/[lang]/settings/campaigns"`, the typecheck and eslint on
      the changed files pass.
