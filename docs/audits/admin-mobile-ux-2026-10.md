# Admin Panel mobile UX audit — October 2026

Every Admin Panel page (`/settings/*`) was audited at phone width. The audit
looked for four kinds of problem: bad layout, wasted padding, cropped views
and overlapping UI. This document lists the pages that need rework, worst
first, and the shared causes behind most of them.

## How it was checked

- **Build.** A production build (`next build && next start`) ran against a
  local Supabase stack with all 210 migrations applied. The data was seeded to
  stress a phone layout: 33 Orders, 25 Customers, 16 Results, 7 RMAs,
  products with 9 Variants, 4 campaigns, long names and emails, and every
  status.
- **Device.** An iPhone-class viewport, 390×844 with touch and a mobile user
  agent, signed in as an Owner. A second metrics-only pass ran at 360px, the
  width of a small Android phone.
- **Coverage.** 45 menu routes (38 distinct screens once redirects are
  merged), 15 detail and editor pages, 16 tabs (every tab of each page's main
  tab list), and 8 dialogs: the first Add/New/Edit dialog on each page, plus
  the Admin Menu sheet.
- **Probe.** On every page an in-page probe measured:
  - horizontal page scroll;
  - elements cut off by a clipping ancestor;
  - table columns and controls hidden off-screen in a horizontal scroller;
  - interactive elements that overlap, or that another element covers (checked
    with `elementFromPoint` while scrolling);
  - tap targets under 32px;
  - padding: the content width left inside each card, and cards much taller
    than what they hold.
- **Review.** Every screenshot was then reviewed by eye. The full-page captures
  hide the fixed dock and blank sandboxed iframes, so neither was counted as a
  finding.
- **Excluded.** Problems that only exist locally are left out. The Orders KPI
  endpoint returns 500 because of a PostgREST relationship. A missing Google
  OAuth toast appears on Appointments. The campaign sending checklist is red
  because the env vars are unset.

**Priority**

- **P1:** broken. Content is cropped or unreachable, or one control covers
  another.
- **P2:** a real layout or padding problem on a page staff use often.
- **P3:** polish.

Tags: `[Layout]` bad UX layout · `[Padding]` wasted padding space ·
`[Crop]` cropped view · `[Overlap]` overlapping UI.

---

## 1. Shared causes — fix these first

Seven root causes in shared primitives produce most of the page findings
below. Fixing them once clears many rows.

| # | Cause | Where | Pages hit |
|---|-------|-------|-----------|
| **S1** `[Overlap]` | The mobile close × floats over content. On phones the dialog × is `sticky` and the right/bottom sheet × is `fixed`, both bottom-right with a translucent backdrop, so they sit on whatever right-aligned control is last: buttons, switches, tiles. `SheetFooter` reserves `pr-[4.25rem]` for it, but most dialogs and custom sheet footers don't use it. The × also repeats the Cancel button that most dialogs already have. | `components/ui/overlay-dismiss.tsx` (`sticky` / `pinned` variants), `components/ui/dialog.tsx` (DialogContent close), `components/ui/sheet.tsx` (pinned close) | The Admin Menu sheet (× covers the **Costings** tile). **Add location** (× covers the *Visible on public page* switch). **New shipping method** (× covers the right end of *Save shipping method*). **New section** (× covers *Create section*). **New API config** (× sits on the *Cancel* corner). **Invite member** (× adds an empty ~60px row under Cancel). |
| **S2** `[Crop]` | `SelectTrigger` is a `Button`, so it inherits `shrink-0`, `whitespace-nowrap` and `min-w-[12rem]`. A `w-full` select in a flex row never shrinks and pushes its sibling off-screen. A long selected value (a Segment name) widens the whole card past the viewport. | `components/ui/select.tsx:102-118`, `components/ui/button.tsx:11` | **Users → Roles**: the *Details* button is 100% off-screen (`roles-tab.tsx:153-168`). **Campaign detail (draft)**: the whole *The email* card is 540px wide and its right ~180px is cut off (inputs, help text, selects). |
| **S3** `[Crop]` | The Admin Panel shell clips horizontal overflow (`overflow-x-clip`) below `md`. Anything that overflows is cut off silently instead of scrolling, so S2 and every wide child turn into invisible content. Keep the clip as a safety net, but treat any element past the gutter as a bug. | `components/settings/settings-sidebar-nav.tsx:521` | Users → Roles, Campaign detail, Partners, Analytics (see the pages) |
| **S4** `[Padding]` | The `Card` primitive has desktop padding at every width: `py-6` plus `gap-6`, and `px-6` in header and content. With the 8px shell gutter a card leaves 324px of 390. A card nested in a card leaves **298px**, and a card header with a title only costs ~80px. Empty states use `p-14` (56px) and are 186–246px tall for one line of text. | `components/ui/card.tsx` (Card, CardHeader, CardContent); empty-state blocks on Orders, Customers, Products, Discounts, Partner applications | Most pages; see the *Padding* tags |
| **S5** `[Crop]` `[Layout]` | Desktop tables are kept on phones inside a horizontal scroller. The columns that matter (status, actions, the change itself) start off-screen, often with a half-cut column at the edge that looks like a rendering bug. | `components/ui/table.tsx:9` (`overflow-auto` wrapper) and each table's columns | **Results** (74% hidden, 24 controls off-screen). **RMA** (59%). **Audit log** (57%: *Action, Entity, Changes*). **Import history** (46%). **Partner commissions** (44%). **Analytics** (40–47%). **Product variants** (*Actions*, 18 controls). **API configs** (*Actions*). **Configure part tables** (remove and *Add* buttons). **Costings** (*Compare-at* cut in half). **Calibration** (22–54%). |
| **S6** `[Padding]` `[Layout]` | Pages show two navigations: the shell breadcrumb, plus an in-page back link or a second breadcrumb. When the back link sits beside the title it also squeezes the title onto two lines. | Detail pages | Order detail, Customer detail, Result detail (*Back* + *Refresh* button row), Campaign new/detail, Email template detail, Customer import, Blog editor, Configure card (second breadcrumb) |
| **S7** `[Layout]` | The Save button sits at the end of a long form and doesn't stick. Some pages have two saves that do different things. | Page forms | Configure card, Discount new (Save inside the 6th card, *Summary* below it), Points settings, Email template, Campaign new, Product detail (header *Save* + *Save product* in the Status card), Couriers (*Save & sync* + *Save connection settings*) |

Smaller shared issues `[Layout]`:

- **Tap targets under 32px** on the touch screens staff use:
  - info tips, 24px, on almost every heading;
  - Page Builder and Forms reorder chevrons, 20×16px;
  - the Rules Engine toolbar, 28px;
  - the Markdown editor toolbar, 20px, on Blog and Product;
  - Audit-log filter chips, 26px;
  - checkboxes, 16px, on Discount scope and the Results bulk select.
- **Desktop-only instructions** shown on touch:
  - the Costings keyboard hint, repeated under all 5 parts tables;
  - Showroom's "W A S D / right-drag";
  - the Calibration sheet's print hint.
- **Raw values shown to staff:**
  - order statuses `Payment_failed` and `Partially_refunded`;
  - Analytics axis labels `total[2026-05-01]`;
  - the Result detail UUID under the title;
  - "Loaded 16 of 16 (page 200)" on Results.

---

## 2. Pages that need rework

### P1 — broken on phones

| Page | Findings | Fix direction |
|------|----------|---------------|
| **Results** `/settings/results` | `[Crop]` The table is 1,459px wide in a 374px scroller. The *Status* badge is cut mid-word ("Needs assi", "Measureme"). *Source, Location, Order, Measured by, Group updates* and 24 controls are off-screen. `[Layout]` The first Result row starts ~720px down, after *Refresh*, the *Your assist link* card, the queue select, search and two filter selects. Only one Result shows above the dock on the first screen. The *Updated* date wraps to 3 lines ("10/28/2026, 12:00:00 PM"). | A card list on phones: name, size·Tier, status, age, one primary action. Collapse the assist link into a header button. Use relative or short dates. |
| **Audit log** `/settings/audit-log` | `[Crop]` *Action, Entity* and *Changes* (the content of the log) are off-screen (57%). *Actor* emails are cut ("showroom.taiseng@mpillov"). `[Layout]` 26px filter chips. | A stacked entry per row: who, when, "entity · action", and the changes as a collapsible diff. |
| **Returns / RMA** `/settings/rma` | `[Crop]` The *Customer* column is cut ("hafiz.rahman", "siti.nurhaliza."). *Resolution, Status* and *Reason* are off-screen (59%), so staff can't see an RMA's state in the list. The order number wraps to 3 lines. `[Layout]` A native select needs a separate *Filter* button to apply. | A card per RMA: order, customer, status badge, resolution, age. Apply the filter on change. |
| **Users & permissions → Roles** | `[Crop]` *Details* is pushed fully off-screen by the `w-full` role select (S2), so role details can't be reached on a phone. | Let the select shrink (`flex-1 min-w-0 shrink`) or put *Details* on its own row. |
| **Campaign detail (draft)** `/settings/campaigns/[id]` | `[Crop]` A long Segment name in the *Segment* select widens *The email* card to 540px. Its right ~180px (inputs, help text, selects) is cut off at both 360px and 390px (S2 + S3). `[Layout]` A back link duplicates the breadcrumb. Subject and preview line are single-line inputs that cut long text. | Fix S2 (truncate the trigger value). Use a textarea for long copy. |
| **Partners** `/settings/partners` | `[Crop]` The *Partner* type badge is cut at the right edge on every row (+6 to +49px). `[Overlap]` On the own-studio row the red trash icon sits on the *Own studio* badge, and a pin icon overlaps the name. `[Padding]` Each location is a ~190px card with two rows of controls (drag, ▲, ▼, logo, then 👁 ✎ 🗑) for one name and address. Names are cut ("Chiropractic & reh…"). | A compact row: drag handle, name/address, badge, overflow menu (⋯) holding view/edit/delete/move. |
| **Partner applications** `/settings/partner-applications` | `[Overlap]` *Approve* and *Reject* share the header row with the name, so the email runs under the *Approve* button ("tcm.harmony@example.co…"). The name is cut ("SpineAlign Physiot…"). | Stack the actions under the header, full width, or put them in a sticky footer per card. |
| **Analytics** `/settings/analytics` | `[Crop]` *Margin by category*, *Product sales timeline*, *Results* and *Inventory movement* overflow the viewport by 55–85px: card borders are missing, text is cut ("unlock categ…"), and the waterfall chart is clipped. `[Overlap]` The Product Configuration tree's zoom controls (+ − Reset) cover node labels ("fil", "3D"). On the *Results* chart the axis title "Qty (final responses)" overprints the tick labels. `[Crop]` Search and Visits tables hide 40–47% (*Clicks, Impressions, Ranking page, Visit → order, Revenue*). `[Layout]` 8,832px in one column. *Refresh* is a full-width primary button. Axis labels show `total[YYYY-MM-DD]`. | Make the tab lists inside cards wrap or scroll. Size charts to their container (`ResponsiveContainer` / `min-w-0`). Move the tree zoom controls out of the canvas. Split Analytics into tabs (Search & AI · Funnel · Margin · Stock). |
| **Dialogs and sheets (S1)** | `[Overlap]` The close × covers controls in the Admin Menu sheet, Add location, New shipping method, New section and New API config (see S1). `[Padding]` **New shipping method** has **0px side padding**: labels and fields touch the screen edges, while its *Pricing* sub-card is padded. It is a 1,385px scroll with 32 tap targets under 32px (country chips). | Put the mobile × in a sticky header (top-right, with the title), or reserve space under it in every scroll body. Give the shipping-method sheet the standard 16px inset. |
| **Configure card** `/settings/inventory/configure/[card]` | `[Crop]` In every BOM table the *Actions* column header is cut to "A", and the grey *Add part* button shows as a sliver at the right edge. Remove buttons are off-screen (19% hidden in each of 4 tables). `[Layout]` A second breadcrumb under the shell breadcrumb, which is itself cut ("Configure > B.."). *Save changes* is only at the bottom of a ~2,000px form. | Rows as Part · Size · Qty stepper · remove (icon). The add row as a full-width select + qty + button below. A sticky save bar. |

### P2 — real layout or padding problems on busy pages

| Page | Findings | Fix direction |
|------|----------|---------------|
| **Orders** `/settings/orders` | `[Padding]` 5 KPI tiles at ~105px each (one number per tile) take ~440px. `[Layout]` Search, status and two full-width date inputs stack into 4 rows. **The first order starts at 841px**, so the first screen shows no order at all. Each row shows only *Order # / Status / Total*. The order number wraps to 3 lines, and there is no customer name or date to recognise the order by. Statuses show raw values (`Payment_failed`). | A horizontal-scroll KPI strip or a 2×2 compact grid. Put the date range in one *Filters* sheet. Rows with order #, customer, date, status, total on two lines. |
| **Order detail** `/settings/orders/[id]` | `[Layout]` The desktop sidebar stacks under the main column, so **Status (update) is ~2,800px down and *Mark as shipped* ~4,050px down** a 5,113px page. The Build snapshot (9-row placement breakdown) and the full Order timeline come first. `[Padding]` The back link beside the title squeezes it to 2 lines. Product names wrap to 7 lines in the items table. The build snapshot is a card nested in a card. | Put the status and the primary fulfilment action at the top (or in a sticky action bar). Collapse the build snapshot and the timeline (show the last 3). |
| **Customer detail** `/settings/customers/[id]` | `[Layout]` **8,417px.** The full Timeline (11 filter chips wrapping to 4 rows, then every event) comes second. Addresses, the editable *Customer info*, *Contact and sign-in*, *Aftercare* and *Marketing email* are 2,700–4,500px down. `[Padding]` The back link beside the name squeezes it to 2 lines. Addresses are cards nested in a card (298px wide). The last-name input cuts "Montgomery-Whit…". | Use section tabs (Overview · Timeline · Orders · Addresses · Settings) or collapsible sections. Make the timeline chips one scrollable row and show 10 events with *Show more*. |
| **Customers** `/settings/customers` | `[Layout]` The *Shopify migration* card stacks 7 stat tiles (~900px) above segments, filters and the list. Six full-width filter selects **and** a *Filters* button (~420px). The first customer is ~1,800px down. `[Padding]` Stat tiles are cards in a card. | Collapse migration stats into a 1-line summary with *Details*. Put every filter in the *Filters* sheet, with chips for the active ones. |
| **Discounts** `/settings/discounts` | `[Layout]` The **Points** settings form (~2,400px) sits above the discount-code list, so the codes start at ~2,700px. `[Padding]` Each bonus milestone is a card in a card, with full-width inputs for short numbers and its delete button alone on its own ~70px row. | Tabs: Codes · Points. Put each milestone on one row (earned · bonus · delete). |
| **Discount new / detail** `/settings/discounts/[id]` | `[Layout]` 7 stacked cards. *Save discount* is inside the 6th (*Status*) card, ~2,050px down, with *Summary* after it. `[Padding]` A ~80px card header on each card. 16px scope checkboxes. | Merge sections into one form with plain section headings. A sticky save bar with the summary in it. |
| **Partner commissions** `/settings/partner-commissions` | `[Padding]` **5,527px.** Every partner shows an always-open 5-field *Record a payout* form, a card in a card. `[Crop]` The payout history table squeezes 5 columns. The commissions table hides *Commission, Status, Release* (44%). | A *Record payout* button that opens a sheet. A card list for commissions. |
| **Product detail** `/settings/products/[id]` | `[Crop]` The Variants table hides *Actions* (18 controls). SKU wraps to 3–4 lines and the stock cell to 4 lines (~115px per Variant; 9 Variants ≈ 1,000px). `[Layout]` Two saves (header *Save*, *Save product* in Status). The editor toolbar wraps to 3 rows of 20px icons. Some selects are half width, others full. | A Variant card list (title, SKU, price, stock, ⋯). One sticky save. |
| **Costings** `/settings/costings` | `[Crop]` *Compare-at* is cut in half in all 5 parts tables ("Compare-…", "(optiona…"). `[Padding]` The keyboard hint is repeated under each table (~15 lines in total). The part cell repeats the category ("Cover Covers") and wraps the size badge onto its own line. Pillow-size cards are cards nested in the product card, and their default template is cut ("Default is XS - basic - def…"). `[Layout]` 4,392px. | On phones drop the keyboard hint and show *Cost / MSRP / Compare-at* as a stacked editor per part (or pin the part column and allow the scroll). Show size cards as a compact list. |
| **Users & permissions → Members** | `[Padding]` Each member card is ~330px tall: "1 profile" floats centred, and there are large gaps between the role select, the note and *Deactivate*. *Invite member* sits alone on its own right-aligned row. | One header row (email + status + profiles), then role and actions on one line. |
| **FAQ** `/settings/faq` | `[Padding]` Questions are cards inside category cards, with eye, delete and chevron columns, so the question text gets ~45% of the width and wraps to 3–4 lines. `[Layout]` 3,875px. The category list and the Q&A list repeat the same categories. | Remove the inner card border. Put the icons in an overflow menu. Collapse categories by default. |
| **Inventory** `/settings/inventory` | `[Padding]` 15 large stat tiles (XS–XL for both pillow types, 3 bolster lengths, two *Custom* tiles; ~1,000px) before the parts list. "Configure…" is set in the stat-number font. A dangling *Inventory management* heading has nothing under it. | A compact size grid (5 sizes in one row per product). Parts first. |
| **Configure products** `/settings/inventory/configure` | `[Padding]` 13 size cards at ~135px each (label, size, "n parts", *Configure* button), in a 2-column grid, ~1,800px. | List rows: "XS · 5 parts ›". |
| **Blogs** `/settings/blogs` | `[Crop]` The *Actions* header is cut ("Actio"). `[Padding]` Edit, show/hide and delete are stacked **vertically**, so each row is ~125px for a one-line title. Status and date aren't shown. | A row with the title, status and date, and a ⋯ menu. |
| **Blog editor** `/settings/blogs/[id]` | `[Layout]` Save and preview exist only as unlabeled icons in the dock. A back arrow repeats the breadcrumb. The toolbar is 20px. At 360px *Browse Media* is cut by 11px. | A labelled sticky save bar. A larger toolbar. A hero-URL row that wraps. |
| **Email templates** `/settings/email-templates` | `[Padding]` Group cards waste ~80px between the heading and the first template. `[Layout]` 5,168px with no search or jump-to-group. | Plain group headings, or an accordion per group. |
| **Email template detail** `/settings/email-templates/[id]` | `[Crop]` *Message* and *Points, for a guest* are single-line inputs that cut the copy ("…we've received orde"). `[Layout]` The back link repeats the breadcrumb. *Save* is at the bottom of the *Words* card. The preview is a fixed 720px iframe with its own scroll. | Textareas for long copy. A sticky save. An auto-height or collapsible preview. |
| **Result detail** `/settings/results/[id]` | `[Padding]` *Back* + *Refresh* as a full-width 2-button row. A raw UUID under the title. 11 measurement fields at one full-width row each (2-digit values). Suggestion values in large nested cards ("Recommended size M" at 110px). `[Layout]` A large red *Delete* sits beside *Refresh suggestion*. | Measurements in a 2-column grid. Drop *Back*. Move *Delete* into a ⋯ menu. |
| **Media** `/settings/media` | `[Layout]` The Media library (upload, folders, assets) starts below 9 landing-image tiles (~1,100px down). | Tabs: Library · Landing images. |
| **Customer import** `/settings/customers/import` | `[Crop]` In Import history the file name is broken every few characters ("cust omer s_ex port_…"), giving a ~480px row. *Already imported*, *Skipped* and *State* are off-screen (46%). | A card per import. |
| **Page Builder** `/settings/page-builder` | `[Layout]` 3 toolbar rows (status / Discard / Publish; History / Live site / Add section; Preview) before the list. Reorder ▲▼ are 20×16px (50 small targets). | One toolbar row plus ⋯. Drag only, or ▲▼ at 44px. |
| **Forms** `/settings/forms` | `[Padding]` Each source is a ~130px card for one line, with 3 icon columns. The slug wraps ("friend-\nfamily"). ▲▼ are stacked and small. | One compact row per source. |
| **Couriers** `/settings/shipping/couriers` | `[Padding]` *Nothing saved yet* and *Never synced.* are full padded cards (94–120px for one line). `[Layout]` 3 action buttons wrap to 2 rows. Two different saves. At 360px the connection checklist text is cut by 6px. | One status line. One save. |

### P3 — polish

| Page | Findings |
|------|----------|
| **API configs** `/settings/general` | `[Crop]` *Actions* (edit/delete) are off-screen in the table. The slug wraps. |
| **Service fees** `/settings/costings/services` | `[Padding]` Sections nest inside one card (≈298px content width). |
| **Campaigns list / sent detail** | `[Layout]` On a sent campaign the result numbers (waves, bounces) are at the bottom, ~3,900px down, under the frozen email form. |
| **Shipping** `/settings/shipping` | `[Padding]` Method cards use desktop padding, and *Edit* / *Delete* sit on their own row. |
| **RMA detail** `/settings/rma/[id]` | `[Layout]` Fine, apart from the back link that repeats the breadcrumb. |
| **Products list** `/settings/products` | `[Layout]` 3 full-width filter selects. Titles cut (by design). |
| **Rules Engine** `/settings/product-builder/rules-engine/[flow]` | `[Layout]` 28px toolbar. "Draft" appears twice. The canvas only renders once rule graphs are seeded (`db:seed-rule-graphs`), so it was checked empty. |
| **Calibration sheet** `/settings/inventory/configure/calibration` | `[Crop]` A print-first sheet. On phones its columns squeeze to one word per line and headers are cut. Low priority unless staff use it on phones. |
| **Showroom** `/settings/showroom` | `[Layout]` Keyboard/mouse instructions show on touch. Otherwise fine. |
| **Admin Menu sheet** | `[Padding]` Every menu item is a ~100px tile in 2 columns, a 1,137px scroll. A 3-column compact grid would halve it. (The × overlap is S1.) |

### Pages that passed

**General** (theme/session), **Documentation** (+ Points and Meta testers docs),
**Partner terms/milestones**, **Users → Staff profiles / Telegram**, **Customers →
Follow-ups / Reviews / Settings tabs**, **Appointments** (layout only; see
below).

The Shopify link page (`/settings/integrations/shopify`) wasn't reviewed for
rework. Shopify is being replaced, and that page gets no new work.

## 3. Not verified

- **Appointments calendar events.** They come from the Google Calendar API, not
  the database, so local runs show an empty calendar. The toolbar, day chips
  and 3-day grid fit at 390px. The event blocks need a check on staging.
- **Real devices.** All of this was measured in Chromium device emulation.
  Safe-area insets, iOS focus zoom and the dock's hide-on-scroll need the
  usual iOS Safari + Android Chrome pass (see `OPS-STAGING-QA.md` in earlier
  mobile PRDs).
- **Rules Engine canvas** with real graphs, as noted above.

## 4. Suggested order of work

1. **S1 (close-button overlap) and S2 (select shrink).** Two primitive changes
   that clear the P1 overlaps and crops in dialogs, Roles and Campaign detail.
2. **A mobile list pattern for tables (S5).** A shared "cards below `md`"
   table variant, applied to Results, RMA, Audit log, Orders, product
   Variants, Import history, Partner commissions and Configure.
3. **Fix the Analytics, Partners and Partner applications overlaps and
   crops.**
4. **Mobile card density (S4).** A tighter `Card` below `md` (e.g. `px-4
   py-4 gap-4`), flattening cards nested in cards, and `p-6` empty states.
5. **Lead with the main task.** Order and Customer detail first (actions up,
   timelines collapsed), then Discounts, Customers, Media and Partner
   commissions (tabs or collapsed secondary sections).
6. **One sticky save bar per long form (S7).**
