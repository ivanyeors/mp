# PRD — Customer page: sections in reach, a journey map, and shortcuts to the customer

**Status:** slices 01 to 05 built on `claude/practical-mccarthy-l2nwwf` (2026-11-15). Slice 06 specified, not started. Slices 02, 03 and 05 each end in a check only the owner can make (see the slice).
**Issue:** not filed. Each slice is a file under [`issues/`](issues/README.md).
**Owner request (2026-11-15):** "Research and rethink about the layout and design of the customer
detail page. Ideally, I want to be able to easily click into the different customer section
details without being able to scroll down as much. 'From Shopify' card and 'timeline' can be
redesigned as a nice 'customer journey' UI for us to also trace. Notes, follow-ups, orders,
purchases can all be part of this customer journey UI as well. 'Contact and sign-in' > 'Contact
details'. We should also allow us to have quick shortcuts like sending email or sending WhatsApp
in the contact details card (also research and think how we can do this with AI's suggestion for
replies). 'Reviews': a reply button in the review card that will redirect us to the exact
review, and an AI suggested reply which we can copy and paste into Google."
**Builds on:** `PRD-customer-crm` (ADR 0028: notes, the Customer timeline, follow-ups, reviews),
`PRD-crm-retention-loop` (Lifecycle stage, Next step), `PRD-google-review-replies` (ADR 0035:
drafts, the Telegram card, Places reviews), `PRD-shopify-customer-migration` (the From Shopify
facts).
**Design record:** three rounds of clickable mock with the owner on 2026-11-15. The owner
approved the layout, asked for larger tabs and a livelier journey, and settled the four
decisions below.

## Problem statement

`/settings/customers/[id]` is fifteen cards in three columns. On a phone it is one column about
fifteen cards tall.

1. **Nothing is in reach.** Reviews, the pillow and the timeline are each several screens down.
   There is no way to jump to one.
2. **What happened is told five times.** Order history, Notes, Follow-ups, Timeline and From
   Shopify each show a slice of the same story, in five places, in five shapes.
3. **The page cannot act.** Staff read an email address and a mobile number, then leave the page
   to write to the customer. Nothing records that they did.
4. **A review cannot be answered from here.** The Reviews card shows a Linked Google review and
   whether we replied. Replying means finding the review on Google by hand and writing from
   scratch, although a draft already exists for the Telegram card.

## Research

- **An overview above a list beats a list.** Gong's account page and UltraCart's customer
  activity put a visual strip over the event list and link the two. The LifeLines study (Plaisant
  et al.) found a graphical overview of a record faster to read than a table.
  → *The map sits above the chapter it selects (slice 04).*
- **Group events into episodes.** Raw event lists grow without limit. Tools that stay readable
  group events that belong together. → *Chapters (slice 04).*
- **Timelines run along the device's longer axis** (Brehmer et al., CHI 2019), and a vertical
  list is fastest for looking one thing up (Di Bartolomeo et al., CHI 2020).
  → *A phone opens the journey as a list; the map is one tap away.*
- **A journey map is only as reliable as its evidence** (NN/g). No product found draws a rising
  and falling line from one customer's own records. → *The line moves only on stated facts, and
  the legend says which.*
- **Deep links.** WhatsApp documents `wa.me/<number>?text=`. Gmail's compose links
  (`mail.google.com/mail/?view=cm`, `googlegmail://co`) are widely used and not documented.
  → *Copy sits beside every button, and an iPhone falls back to its own mail app (slice 02).*

## Owner decisions (2026-11-15, all settled)

1. **The line keeps its three heights:** Going well, Steady, Needs care.
2. **The tab is called Journey.** CONTEXT.md lists "Customer journey" under _Avoid_ for the
   concept; the concept stays **Customer timeline** and gains one line: Journey is the name of the
   tab that shows it as chapters.
3. **Orders live inside the journey only.** No Orders tab and no Order history card.
4. **Email goes from `sg@mpillow.com` with `admin@mpillow.com` on Cc,** for now. Both are named
   once, in `lib/contact.ts`.
5. **Shortcuts open the customer's own apps.** Nothing is sent from the platform. (Sending from
   the page and WhatsApp through Meta's business platform are parked.)
6. **Claude drafts only when asked.** A suggested reply or message is generated through Claude's
   API when a Staff member presses *Generate reply suggestion* or *Generate suggestion*, never
   because a tab or a mode was opened.

## Solution

One page in three parts.

- **Header:** name, Lifecycle stage, the numbers in one line, and five buttons: Email, WhatsApp,
  Note, Follow-up, Create order. The Next step line stays under it.
- **Left rail:** a **Contact details** card (email and mobile, each with its buttons and its
  facts; name, mobile and tags edit in place), then one row each for Sign-in, Addresses,
  Preferences, Points and How they found us. A row opens in place.
- **Three large tabs:** **Journey**, **Pillow and fittings**, **Reviews**. The open tab is kept
  in the address (`?tab=`), so a link opens straight on Reviews.

The Journey tab holds a composer (Note, Follow-up, Email, WhatsApp), the journey map, and the
chapter that is open. Order history, Notes, Follow-ups, Timeline and From Shopify are no longer
cards: they are entries, actions and facts inside chapters.

### Chapters

The Customer timeline already merges sixteen sources on the server. A **chapter** is a run of
its entries that belong together. `lib/crm/journey/chapters.ts` builds chapters in the browser
from the entries the timeline route returns, so no source and no table changes.

- An entry joins the latest chapter when it is about a record already in it (the same Order,
  the same Follow-up), or when it falls within 10 days of the chapter's last main entry.
- Reminders and marketing email (campaign sends, order email, aftercare switches, a claim link
  opened) never start a chapter beside a main one and never stretch one. Alone, they gather
  into one quiet chapter.
- A chapter is named for its most telling entry: a review, a return, an order, a re-adjustment,
  a fitting, a Result, the account, a follow-up, a note.
- **Now** is always the last chapter. It holds the open Follow-ups and the Next step.
- The earliest Follow-up due after today is drawn as the next stop, dashed.

### Heights

Stated facts only. Needs care wins over Going well in one chapter.

| Height | Facts |
|---|---|
| Needs care | a review of 3★ or lower; a return opened; a refund asked for; an order cancelled; a re-adjustment no-show; in Now, an overdue Follow-up |
| Going well | an order paid; a re-adjustment attended; an in-store fitting; a review of 4★ or 5★ |
| Steady | everything else |

A review entry carries its stars as `rating`, a new optional field on the timeline entry, so
the height never reads a number out of display text.

### What is not built here

- **The stage band under the map.** Drawing the Lifecycle stage as of each chapter needs dated
  purchase facts replayed through `lifecycleStage`, in step with the overview's SQL. The map
  shows the stage as it is today on the Now stop. A band is slice 06, specified, not built.
- **A record of messages.** "Sent it" saves a **Customer note** by the Staff member
  (*Emailed them from Gmail…*), so it works without a migration. A table of its own is a later
  choice, if messages need counting.

## Slices

See [`issues/README.md`](issues/README.md).

| # | Slice | Size |
|---|---|---|
| 01 | Layout: header, Contact details, rail rows, three large tabs | Medium, **built** |
| 02 | Email and WhatsApp buttons that open Gmail and WhatsApp | Small, **built** |
| 03 | Reply to a Google review from the Reviews tab | Small, **built** |
| 04 | The journey map: chapters, the map, Now, the composer | Large, **built** |
| 05 | Suggested messages in the composer | Medium, **built** |
| 06 | The Lifecycle stage band under the map | specified, not built |

## Success

- From the top of the page, any section is one press away on a desktop and two on a phone.
- A Staff member can go from a 1★ review to a reply on Google with one copy and one press.
- Every email or WhatsApp sent from the page leaves an entry in the journey.
