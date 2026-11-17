# 04 — The journey map: chapters, the map, Now, the composer

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-11-15)
**Blocked by:** 01
**Labels:** `enhancement`, `area:admin`

## Goal

One place tells the Customer's story and takes the next action. The demo: a customer with a
first order, a 1★ review eight months later and a re-adjustment reads as four stops on a line
that dips at the review, with the overdue follow-up waiting on the Now stop.

## What to build

- `lib/crm/journey/chapters.ts`, pure and tested: chapters from timeline entries (the PRD has
  the rules), each with a title, a date range, a height, the kinds it holds, and the quiet time
  before it.
- `rating` on a review's timeline entry (Google and shop), so heights read a number.
- **The map:** stops at three heights on a smooth line, labelled gaps between stops, a dashed
  line to the next due Follow-up, a ring on Now. Wider than its card, it scrolls inside the
  card and opens at the Now end. Hidden when there are fewer than three stops.
- **The list:** every chapter as a card, newest first, with the quiet time between. A phone
  opens here.
- **Filters:** All, Orders, Fittings and care, Conversations, Marketing and account. A filter
  dims the stops with nothing to show and narrows the entries.
- **A chapter card:** its entries with links, statuses and details; a note's *Delete* for those
  who may; an open Follow-up's actions; the From Shopify facts on the chapter that holds the
  import.
- **Now:** open Follow-ups with their due date, assignee and *Done*, and the Next step.
- **The composer:** Note and Follow-up (Email and WhatsApp arrive in slices 02 and 05). A saved
  note or follow-up shows in the journey at once.
- *Load older* extends the map and the list.

## As built (2026-11-15)

- `lib/crm/journey/chapters.ts` with `buildChapters`, `chapterTone`, `journeyNow`, `gapLabel`
  and the four filters; 28 tests. `rating` is on the two review adapters' entries.
- `customer-journey.tsx` reads the timeline route (no `kinds`: filters narrow in the browser)
  and the Follow-ups route; `journey-map.tsx` draws; `journey-composer.tsx` writes.
- The map fits about seven stops in the card on a laptop; more scroll inside it. A phone opens on
  the list until *Map* is pressed.
- The From Shopify facts show on the chapter that holds `account.imported`; when no loaded
  chapter holds it and nothing older is unread, they show under the list.
- After a change the newest page is read again and laid over what is loaded.
- **Tests:** `chapters.test.ts`, `journey-render.test.tsx`, `followups-render.test.tsx`.
- **Not built:** the stage band (slice 06). The Now stop carries today's Lifecycle stage as its
  second line.

## Acceptance criteria

- [ ] The rules are pure and tested case by case, including the quiet chapter and record
  affinity.
- [ ] A height is set only by the facts in the PRD's table.
- [ ] A viewer without `orders` sees no order entry and no Orders filter, as on the timeline.
- [ ] The map never causes the page to scroll sideways.
- [ ] Nothing here writes except the composer, a note's delete and a Follow-up's actions.
