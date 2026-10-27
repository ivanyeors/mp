# 04 — Stage chips above the Customers list, counted live

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 03
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:admin`

## Goal

Staff see the shape of the customer base at a glance. The demo: a row reads *New 120 · Repeat 40
· Loyal 12 · At risk 85 · Lapsed 30*; choosing one filters the list.

## What to build

- A chip row beside the Segments row (`segments-row.tsx`), one chip per stage, each a live count
  through `countCustomers` and a link that writes `stage=` into the URL.
- With `campaigns`, a stage chip's menu offers *Email this stage*, as slice 02 does for a Segment.
  The new campaign's Audience is a Segment saved for that stage, created on first use and named
  after it.
- A one-line note under the row: a stage is everyone in it; a campaign still goes only to those
  subscribed to marketing email.

## Acceptance criteria

- [ ] Counts match the list when the chip is chosen.
- [ ] A failed count shows a dash, never zero.
- [ ] The row scrolls sideways on a phone and never widens the page.
