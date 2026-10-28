# Admin Panel mobile audit: spacing, tap targets and tap states — October 2026

The Admin Panel on a phone spends its space in the wrong places. Containers
carry desktop padding, cards sit inside cards, and empty states are large.
Meanwhile the things staff actually press (rows, tabs, checkboxes, chips,
handles) are small, tightly packed, and give no feedback when pressed.

This audit is scoped to three changes, at phone width (below `md`):

1. **Cut** padding and spacing that holds no content and no control.
2. **Add** that space back at interaction points: tappable rows and cards,
   buttons, tabs, toggles, chips and handles, so each one is a full 44px target
   with room around it.
3. **Add a tap (pressed) state** to everything tappable, because on a phone
   nothing in the Admin Panel reacts to a press except the `Button` primitive.

Crops and overlaps found in the first pass are listed in
[Appendix B](#appendix-b--other-defects-found-outside-this-scope). They aren't
the focus here, but most get fixed by the same changes.

## How it was measured

- **Build:** a production build against a local Supabase with seeded data
  (33 Orders, 25 Customers, 16 Results, Variants, campaigns, RMAs).
- **Device:** an iPhone-class 390×844 viewport, with touch.
- **Coverage:** 48 screens, every Admin Panel route plus the main detail pages.
- **The probe:** for every element staff can tap, it records:
  - the hit area, including hit areas extended with `::after`;
  - the distance to the nearest other target;
  - whether the element has any pressed feedback. That means an `active:`
    style, a global `:active` rule, or the `Button` primitive's
    Motion `whileTap`. `hover:` styles don't count, because Tailwind v4 only
    applies them on devices that can hover, so phones never show them.
- **The "padding to cut" figure:** it applies the target tokens below to
  every framed container:
  - card padding of 16px;
  - empty states at 24px;
  - nested boxes flattened;
  - gaps inside a box capped at 12px.

  It covers padding only. The layout changes in §1.2 save more.
- **Blank rows, first screen:** the share of the first screen (below the
  header, above the dock) where no text, image or control appears in the row.
- **Annotated maps (in the visual report):** pink marks padding that can be cut. Outlines mark tap
  targets: red is under 44px, amber has no pressed state, green is fine.

## The numbers

| | Today | Target |
|---|---|---|
| Tap targets with **any pressed state** | **362 of 1,387 (26%)**. Rows, tappable cards, tabs, links, toggles and clickable divs have **0%**. | 100% |
| Tap targets **under 44px** in a dimension that matters | **545 (39%)** | 0, except inline text links |
| Neighbouring targets **closer than 8px** (where one is under 44px) | **452 pairs** | 0 |
| Targets with `hover:` feedback only, which a phone never shows | **649** | 0 |
| Padding that holds nothing, measured | **5,232px** across 48 screens; up to 584px on one page (Customer detail) | cut |
| Boxes nested inside another padded box | **88** | flattened |
| First screen that is blank rows (median page) | **35%**; Orders 56%, Admin Panel home 64%, Shipping 54% | ≤ 25% |

---

## 1. Spacing to cut

### 1.1 Primitive tokens (one change each, every page benefits)

| Where | Today on a phone | Change below `md` | Effect per instance |
|---|---|---|---|
| `Card` (`components/ui/card.tsx`) | `py-6 gap-6`; `px-6` on `CardHeader` / `CardContent` / `CardFooter` | `max-md:py-4 max-md:gap-4 max-md:px-4` | −16px height, −8px per header→content gap, **+16px content width** (324 → 332px together with the 12px gutter below). Measured on most of the 5,232px. |
| A box inside a card (milestones, KPI tiles in a card, FAQ questions, addresses, payout forms, Result suggestion tiles, build snapshot) | Its own border plus 12–16px padding inside the card's 24px | No border or padding on phones. Separate items with `divide-y` rows or a subheading. | +24–34px width and −24–32px height per box; **88 boxes** |
| Empty states, hand-rolled each time (`border-dashed p-14` and similar; 27 uses of `p-12` to `py-16` in Admin Panel files) | 56px padding, so 186–246px tall for one line | One shared `EmptyState` with `max-md:py-8 max-md:px-4` | −48px each |
| Page sections | `space-y-6` (24px) between sections | `max-md:space-y-4` | −8px per section |
| Dialog body (`components/ui/dialog.tsx`) | `p-6` | `max-md:p-4` | +16px width inside every dialog |
| Shell gutter (`settings-sidebar-nav.tsx:581`) | `px-2` (8px): titles and filters touch the edge, while cards add 24px more | `px-3` (12px) together with the 16px card padding | Titles and filters get a 12px edge instead of 8px; text inside a card sits at 29px instead of 33px |

### 1.2 Layout spacing (per page)

These are spacing problems caused by layout rather than padding tokens:

- **Stat tiles in their own cards.** Orders shows 5 KPI cards at ~130px each,
  and Costings shows 4. Customers shows 7 migration tiles, and Inventory 15
  stat tiles (~1,000px). A one-number tile should be about 64px: `p-3`, the
  label on top, the number below, any icon inline. Put tiles in a 2-column
  grid or a horizontal strip.
- **Stacked full-width filters.**
  - Orders has 4 rows: search, status, from-date and to-date.
  - Customers has 6 selects plus a *Filters* button.
  - Products has 3 selects.
  - Results has 4 rows before the list.

  On phones, keep one search field plus a *Filters* button that opens a
  sheet, and show active filters as removable chips. That saves 100–400px
  before the first row.
- **Duplicate navigation.** Eight detail pages show an in-page back link or a
  second breadcrumb under the shell breadcrumb: Order, Customer, Result,
  Campaign new and detail, Email template, Customer import, Blog editor and
  Configure card. That costs 40–60px each, and squeezes the title onto two
  lines when it sits beside it.
- **Large blank gaps inside components.**
  - A member card has 48–72px of gaps around a floating "1 profile".
  - A Result suggestion card has an 84px gap.
  - A partner location row has 78px of gaps from two rows of controls.
- **Full-width secondary buttons.**
  - *Refresh* is a full-width button on Analytics and Results.
  - *Back* and *Refresh* make a 2-button row on Result detail.
  - *Add discount* and *New post* are full-width.

  Header actions should be icon or compact buttons in the title row.
- **One-line statuses in full cards.** Couriers shows "Never synced." and
  "Nothing saved yet." in 94–142px padded cards. Make each one a status line.

## 2. Spacing to add at interaction points

### 2.1 Rules

1. **44×44px minimum hit area** for every tap target except inline links in
   running text. Grow the hit area, not the glyph:
   - add padding where there is room;
   - where layout must not grow, extend it with a pseudo-element, as `InfoTip`
     already does (`relative after:absolute after:-inset-2.5`).
2. **8px minimum between neighbouring targets** (`gap-2`). Keep destructive
   actions at least 16px from the primary action, or put them in a ⋯ menu.
3. **A row or card that opens something is one target, edge to edge.** Use a
   real `<Link>` stretched over the row (`relative` row +
   `after:absolute after:inset-0` on the link), not
   `<TableRow onClick={router.push}>`.
   - Sizes: `min-h-12` (48px) for one line, `min-h-14` (56px) for two.
   - Padding: `px-3 py-3`, with a trailing chevron.
   - Secondary actions are 44px icon buttons at the row's end, layered
     above the link (`relative z-10`).
4. **A checkbox, switch or radio is pressed through its whole label row**
   (`min-h-11`), never through the 16px box alone.
5. **The dialog/sheet close × gets its own space** in a sticky header. It
   must not float over the last control (see Appendix B, S1).

### 2.2 Where the 545 undersized targets come from

| Count | What | Typical size | Fix |
|---:|---|---|---|
| 138 | Chips, pills and text buttons: segment chips, tag ×, placeholder chips, "N profiles", Page Builder section names, filter chips, *View* in Audit log | 14–32px tall | `min-h-11`, or a pseudo-element extension where the layout must not grow |
| 119 | Breadcrumb and docs table-of-contents links | 17–20px tall | Hit area to 44px (`py-3 -my-3`); table-of-contents links as `py-2.5` rows |
| 79 | Drag handles, ▲▼ reorder buttons, Markdown toolbar icons | 16–32px | `size-11` handles; a 36–40px toolbar in one scrollable row |
| 67 | Clickable `div`/`span` elements: Costings grid cells, calendar day headers, tag ×, chart marks | 3–37px | Real buttons or rows at 44px; edit chart and grid values in a sheet on phones |
| 44 | Tabs | 35px (40px on Appointments) | `TabsList` `max-md:h-11` |
| 42 | Checkboxes (16px) and switches (36×20) without a label row | 16–20px | Whole label row, `min-h-11` |
| 39 | Buttons just under target: Appointment day chips, scope rows, FAQ toggles | 40px | `min-h-11` |
| 17 | Icon buttons and others (*Set image* 38px, hide 32px) | 32–38px | `size-11` |

### 2.3 Component changes

| Component | Today | Change |
|---|---|---|
| `TabsTrigger` / `TabsList` (`components/ui/tabs.tsx`) | 35px tall | `max-md:h-11` list, triggers fill it |
| Breadcrumb links (`components/ui/breadcrumb.tsx`) and the docs table of contents | 17–20px tall | Hit area to 44px: `py-3 -my-3` on breadcrumbs, `py-2.5` rows in the table of contents |
| `Checkbox` (`size-4`) / `Switch` (`h-5 w-9`) | The control alone is the target in many places (table select, scope lists, settings toggles) | Wrap in a label row (`flex min-h-11 items-center gap-3`) and give table select cells the full cell |
| Drag handles (`components/ui/sortable-row.tsx`: `min-h-11 min-w-8`), ▲▼ reorder | 20×16 to 24×32px | `size-11`; drop ▲▼ where drag exists, or make them 44px |
| Markdown editor toolbar (Blog, Product) | 20px icons, wrapping to 3 rows | 36–40px buttons in one scrollable row |
| Chips / filter pills / text buttons (Audit-log filters, segment chips, Page Builder section names, tag ×, placeholder chips) | 14–32px tall | `min-h-11` or a pseudo-element extension to 44px |
| Icon buttons in rows (Page Builder hide/show, Partners, Forms) | 32px | `size-11`; collapse 3+ row actions into one ⋯ (44px) |
| List rows (Orders, Results, Customers, RMA, Audit log, Blogs, Email templates, Configure sizes) | Only a small inner link or button is tappable on **87 rows**; tappable rows have no pressed state | The stretched-link row pattern from rule 3 |

## 3. Tap (pressed) state

### 3.1 Today

- **`Button` (plain `<button>` path):** Motion `whileTap={{ scale: 0.95 }}`
  plus a ripple that starts **after** the click. Apart from the third-party
  Markdown editor toolbar, which brings its own `:active` style, this is the
  only pressed feedback in the Admin Panel.
- **`Button asChild` (links styled as buttons):** the Slot path drops both the
  `whileTap` and the ripple, so there is no feedback.
- **Drag handles (`SortableRow`):** `active:cursor-grabbing` changes only the
  cursor, which a phone doesn't show.
- **Everything else** has no pressed state: table rows, tappable cards, Admin
  Menu tiles, tabs, checkboxes and switches, chips, breadcrumb links,
  accordion and collapsible headers, and clickable divs. **649 targets**
  only have `hover:` styles, which Tailwind v4 never applies on a phone.
- **`-webkit-tap-highlight-color`** isn't set anywhere. Phones fall back to
  the browser's own highlight flash on links and buttons. It is inconsistent
  between iOS and Android and doesn't follow the component's shape or colour.

### 3.2 Spec

**One pressed style per surface type**, applied in the primitives so that
pages inherit it:

| Surface | Pressed style |
|---|---|
| Filled button (default, destructive, secondary) | Background darkens ~10% (`active:bg-primary/85`, …) + `scale(0.97)`. Keep Motion for `<button>`, and add `active:scale-[0.97]` to `buttonVariants` so `asChild` links get it too. |
| Outline, ghost and icon button | `active:bg-accent` (round tint on icon buttons, filling the 44px hit area) |
| List row, table row link, tappable card, Admin Menu tile | `active:bg-muted` across the whole surface. **No scale** on large surfaces. |
| Tab, segmented control, chip (inactive) | `active:bg-muted` (or `active:bg-background/60` inside a muted list) |
| Checkbox / switch / radio row | Row `active:bg-muted/60` |
| Text link, breadcrumb | `active:opacity-60` |
| Drag handle | `active:bg-accent active:cursor-grabbing` |

**Behaviour**

- **Timing:** show the pressed style as soon as the finger lands (`:active`, no
  delay), and release over 120–150ms (`transition-colors`).
- **Not the same as selected:** a selected tab or row keeps its own style;
  pressed is momentary.
- **Disabled:** no pressed state.
- **Reduced motion:** with `prefers-reduced-motion`, drop the scale and keep
  the tint.
- **Native flash:** once the primitives have pressed styles, set
  `html { -webkit-tap-highlight-color: transparent }` in `app/globals.css`, so
  the browser flash doesn't double up. Do this last, because today the flash
  is the only feedback most targets have.
- **iOS:** Safari applies `:active` only when a touch listener sits on the
  element or an ancestor. React's root listener covers this, but check it on
  a real device.

**Where it lives**

- **One definition:** one `pressable` utility in `app/globals.css` (e.g.
  `@utility pressable-surface` and `pressable-subtle`), or exported class
  constants beside the primitives, the way `pageActionClassName` is done.
- **Apply it in the primitives:**
  - `TableRow` when clickable, plus the row-link pattern;
  - a `Card` link variant;
  - `TabsTrigger`;
  - checkbox/switch label rows;
  - breadcrumb links;
  - the Admin Menu tiles (`settings-sidebar-nav.tsx:485`);
  - `SortableRow` handles;
  - `buttonVariants`.
- **Guard:** a `.check.ts`, like `settings-mobile.check.ts`, asserting that
  each of these carries the pressed token.

## 4. Screen by screen

Roughly ordered by how often staff use the screen. *Cut* is space to take away; *Add*
is space to give to targets; *Tap* is pressed-state work beyond the
primitives.

| Screen | Cut | Add | Tap |
|---|---|---|---|
| **Orders** | 5 KPI cards (~130px each) → compact tiles. 4 stacked filter rows → search + Filters sheet. The first order is at 841px today. | Rows become stretched links, `min-h-14`, with customer and date on line 2 | Rows have `hover:` only (25 targets) |
| **Order detail** | 3 nested boxes (build snapshot). Back link beside the title. Card padding: 380px measured. | 1 target on the first screen. Put status and *Mark as shipped* in a sticky action bar. Make *Open result* (16px) and the tracking link (14px) 44px rows. | Timeline rows and the linked-Result card |
| **Results** | Assist-link card, *Refresh* row and 4 filter rows before the list | Row = one target. The 16px select-all and row checkboxes become cell-wide targets. | Rows: none today |
| **Result detail** | *Back* + *Refresh* row. Raw UUID. 8 nested boxes. An 84px gap in the suggestion card. 332px measured. | *Delete* moved away from *Refresh suggestion*. The phone link (17px) becomes a 44px row. | The *Product* and *Filling mix* collapsible headers have none |
| **Customers** | 7 migration tiles nested in a card. 6 filter selects plus a Filters button. | Segment chips (32px) and their ⋯ menus (24×24) → 44px. Tabs at 35px. Customer cards become whole-card links. | Customer cards, segment chips, tabs |
| **Customer detail** | 8 nested boxes (addresses). Back link. Card padding: 584px measured, the most of any page. | Timeline entries are links 17–40px tall → whole-row targets. Tag × is 22px. Aftercare switches are 36×20, with 20px-tall labels → label rows. | Timeline rows, tags, switch rows |
| **Returns / RMA** | — | On each of 7 rows the only target is the date text (17px tall) → whole row | Rows |
| **Appointments** | — | Day chips and view tabs are 40px, and day headers 37px. 16 under 44px, 11 crowded pairs. | Day chips, tabs, slots |
| **Audit log** | — | Each of 26 rows has a "View" button 16px tall as its only target → whole row. Filter chips are 26px. | Rows and chips |
| **Inventory / Configure products** | 15 stat tiles (~1,000px). 13 size cards at ~135px. | *Set image* buttons are 38px. Make each size card the target, not just its *Configure* button. | Cards and tiles |
| **Configure card** | A second breadcrumb | BOM rows: qty field + remove at 44px, 8px apart. The add row goes under the table. | Remove buttons |
| **Costings** | 4 KPI cards. A keyboard hint under each of 5 tables. Size cards nested in the product card. | Grid cells are clickable at 36–37px and touch each other (41 under 44px, 39 crowded pairs). On phones edit a part in a row sheet. | Size cards and grid cells |
| **Product detail** | Card padding: 212px measured. Two saves. | The Markdown toolbar: 20px icons 0–2px apart (21 crowded pairs). Language tabs at 35px. 9 Variant rows where only parts are tappable. | Variant rows |
| **Discounts** | The Points form sits above the codes. 4 nested milestone boxes, each with a lone delete row. | Milestone on one row: earned · bonus · delete (44px). The *Points are on* switch (36×20, 14px label) → a label row. | Code rows |
| **Discount new / detail** | 7 cards × ~80px headers. 244px measured. | Scope list rows are 20–40px with 16px checkboxes → 44px label rows. *Active* switch 36×20. | Scope rows |
| **Users & permissions** | Gaps in member cards (48–72px). 360px measured. | "N profiles" is a full-width button only 20px tall → a 44px row. Tabs at 35px. | Member cards, tabs |
| **Partners** | 78px of gaps per location row (two rows of controls) | Drag handle 32px wide, ▲▼ and 👁 ✎ 🗑 → drag + one ⋯ menu | Location rows |
| **Partner applications / commissions** | A payout form nested in every partner. 216px measured. | *Approve* / *Reject* on their own row, not squeezed beside the name | — |
| **Page Builder** | 3 toolbar rows | **61 under 44px and 72 crowded pairs, the most on the Admin Panel.** ▲▼ at 20×16, drag at 24×32, hide at 32×32, section names as 20px-tall buttons. Drag only, with 44px handles, and the whole row opens the section. | Section rows |
| **Forms** | Each source card is ~130px for one line | Drag handles 32px wide. Source names are 20px-tall buttons. 20 crowded pairs. | Source rows |
| **FAQ** | **32 nested boxes** (questions inside category cards): 512px measured. Question text gets ~158px of width. | Question toggles are 40px → the whole question row (44px+). Tabs at 35px. | Question rows |
| **Email templates** | Card headers: 240px measured | The Campaigns / Templates links are 32px tall and touch | 39 template items, hover only |
| **Email template / campaign detail** | Card padding. Back link. | Placeholder chips are 22px → 44px | Chips |
| **Blogs** | — | 10 rows with 3 icons stacked vertically → a row link + ⋯ | Rows |
| **Analytics** | 15 nested boxes. Empty states padded inside cards. 500px measured. | **223 crowded pairs**: tab lists (35px), chart toggles and marks sit edge to edge. *View as table* is 20px. | Tabs and toggles |
| **Shipping / Couriers** | One-line status cards. 3 header buttons wrap. | Country chips in the method sheet (32 under 44px) | Method cards |
| **Admin Menu sheet** | ~100px tiles (`min-h-16 py-3`) → ~64px. A 3-column grid halves the 1,137px scroll. | The × must not cover the last tile | Tiles are `hover:` only |

All 48 screens, measured, are in [Appendix A](#appendix-a--measurements-per-screen).

## 5. Order of work

1. **The pressed state in primitives:** a `pressable` utility, plus
   `buttonVariants` (fixes `asChild`), `TableRow`, `TabsTrigger`, the Admin
   Menu tile and breadcrumb. This is the smallest change with the widest
   reach, and it touches no layout.
2. **Hit areas in primitives:** tabs `h-11`, checkbox/switch label rows,
   breadcrumb hit area, drag handles `size-11`, and chips `min-h-11`. Then
   set `-webkit-tap-highlight-color: transparent`.
3. **The stretched-link row pattern:** one shared row component, applied to
   Orders, Results, RMA, Audit log, Customers, Blogs, Email templates,
   Configure sizes and Partners.
4. **Card padding tokens and flattening nested boxes:** `Card` `max-md:p-4`,
   one `EmptyState`, `space-y-4`, and the 12px gutter. Then flatten the 88
   nested boxes, page by page, starting with FAQ, Customer detail, Result
   detail, Analytics and Discounts.
5. **Per-page layout spacing:** compact stat tiles, the filter sheet, no
   duplicate back links, and status lines instead of cards.
6. **Re-measure against Appendix A,** which is the baseline. Then do a
   real-device pass (iOS Safari + Android Chrome) for `:active` and the
   tap-highlight change.

---

## Appendix A — measurements per screen

| Screen | Height | Padding to cut | Blank rows, first screen | Targets | Under 44px | Closer than 8px | Only part of the row tappable | With a pressed state |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| API configs | 844px | 0px | 55% | 8 | 3 | 0 | 2 | 38% |
| Admin Panel home | 844px | 0px | 64% | 9 | 0 | 0 | 0 | 11% |
| Analytics | 8,832px | 500px | 37% | 102 | 62 | 223 | 8 | 20% |
| Appointments | 1,367px | 0px | 6% | 22 | 16 | 11 | 0 | 18% |
| Audit log | 2,365px | 0px | 11% | 33 | 32 | 0 | 26 | 0% |
| Blog editor | 1,712px | 0px | 34% | 18 | 16 | 9 | 0 | 67% |
| Blogs | 1,886px | 0px | 11% | 33 | 1 | 0 | 10 | 61% |
| Calibration sheet | 6,138px | 0px | 13% | 4 | 4 | 0 | 0 | 0% |
| Campaign detail (draft) | 3,606px | 140px | 36% | 17 | 6 | 0 | 0 | 47% |
| Campaign detail (sent) | 4,254px | 188px | 45% | 17 | 8 | 0 | 0 | 29% |
| Configure card | 2,056px | 0px | 32% | 19 | 7 | 1 | 5 | 58% |
| Configure products | 1,864px | 0px | 39% | 30 | 3 | 0 | 0 | 43% |
| Costings | 4,392px | 0px | 36% | 72 | 41 | 39 | 0 | 1% |
| Couriers | 2,172px | 140px | 44% | 17 | 6 | 0 | 0 | 35% |
| Customer detail | 8,417px | 584px | 36% | 50 | 21 | 5 | 7 | 50% |
| Customer import | 1,041px | 28px | 32% | 5 | 2 | 0 | 1 | 20% |
| Customers | 3,880px | 196px | 48% | 47 | 13 | 8 | 0 | 15% |
| Discount new / detail | 2,451px | 244px | 46% | 41 | 22 | 12 | 0 | 7% |
| Discounts | 3,737px | 140px | 38% | 24 | 3 | 0 | 0 | 25% |
| Docs: Meta testers | 2,209px | 0px | 29% | 8 | 8 | 4 | 0 | 0% |
| Docs: Points | 7,438px | 0px | 31% | 17 | 17 | 11 | 0 | 0% |
| Documentation | 844px | 56px | 67% | 4 | 1 | 0 | 0 | 0% |
| Email campaigns | 1,619px | 44px | 32% | 10 | 6 | 1 | 3 | 10% |
| Email template detail | 2,864px | 112px | 35% | 10 | 7 | 0 | 4 | 20% |
| Email templates | 5,168px | 240px | 39% | 39 | 4 | 1 | 0 | 0% |
| FAQ | 3,875px | 512px | 44% | 159 | 22 | 1 | 0 | 4% |
| Forms | 931px | 0px | 25% | 36 | 12 | 20 | 5 | 19% |
| Inventory | 1,907px | 0px | 42% | 27 | 4 | 0 | 0 | 11% |
| Media | 3,992px | 0px | 18% | 85 | 1 | 0 | 0 | 54% |
| New campaign | 2,462px | 56px | 35% | 8 | 4 | 0 | 0 | 38% |
| Order detail | 5,113px | 380px | 13% | 14 | 4 | 0 | 0 | 43% |
| Orders | 2,730px | 80px | 56% | 26 | 1 | 1 | 0 | 4% |
| Page Builder | 992px | 0px | 35% | 66 | 61 | 72 | 0 | 5% |
| Partner applications | 2,610px | 112px | 26% | 11 | 2 | 0 | 0 | 73% |
| Partner commissions | 5,527px | 216px | 37% | 19 | 4 | 0 | 0 | 0% |
| Partners | 1,526px | 128px | 35% | 46 | 11 | 2 | 0 | 72% |
| Partners: hidden list | 844px | 0px | 93% | 2 | 2 | 0 | 0 | 0% |
| Product detail | 3,766px | 212px | 29% | 62 | 39 | 21 | 9 | 58% |
| Products | 1,428px | 0px | 32% | 19 | 3 | 1 | 0 | 16% |
| RMA detail | 1,496px | 8px | 45% | 10 | 6 | 0 | 0 | 0% |
| Result detail | 3,021px | 332px | 36% | 16 | 3 | 0 | 0 | 56% |
| Results | 1,252px | 0px | 24% | 36 | 8 | 0 | 0 | 56% |
| Returns / RMA | 844px | 0px | 11% | 11 | 8 | 0 | 7 | 0% |
| Rules Engine | 916px | 0px | 5% | 12 | 11 | 6 | 0 | 8% |
| Service fees | 940px | 56px | 49% | 8 | 2 | 0 | 0 | 0% |
| Shipping | 1,750px | 96px | 54% | 15 | 6 | 0 | 0 | 80% |
| Showroom | 1,905px | 72px | 11% | 15 | 10 | 0 | 0 | 7% |
| Users & permissions | 2,382px | 360px | 44% | 28 | 12 | 3 | 0 | 54% |

## Appendix B — other defects found (outside this scope)

From the first pass. Several are interaction-point problems and are fixed by
§2 and §3.

| # | Defect | Where |
|---|---|---|
| S1 | The mobile close × floats bottom-right over the last control. It covers the Costings tile in the Admin Menu, the *Visible on public page* switch, *Save shipping method* and *Create section*. | `components/ui/overlay-dismiss.tsx` (sticky/pinned), `dialog.tsx`, `sheet.tsx` |
| S2 | `SelectTrigger` inherits `Button`'s `shrink-0`, `whitespace-nowrap` and `min-w-[12rem]`. A full-width select pushes its neighbour off-screen, and a long value widens its card. | `components/ui/select.tsx:102`. Users → Roles (*Details* is off-screen); Campaign draft (the form card is cut on the right). |
| S3 | The shell's `overflow-x-clip` hides overflow instead of scrolling | `settings-sidebar-nav.tsx:521` |
| S5 | Desktop tables on phones hide their key columns: Results 74%, RMA 59%, Audit log 57%, Import history 46%, Partner commissions 44%, Variants and API configs (*Actions*), Costings (*Compare-at* cut in half) | `components/ui/table.tsx` and each table |
| — | Analytics cards and charts run 55–85px off-screen; the tree's zoom controls cover node labels; an axis title prints over the tick labels | `settings/analytics/AnalyticsClient.tsx` |
| — | Partners: type badges are cut, and icons overlap the own-studio row | `settings/partners/partners-client.tsx` |
| — | Partner applications: *Approve* covers the applicant's email | `settings/partner-applications` |
| — | New shipping method sheet: 0px side padding | the shipping method sheet |
| — | Single-line inputs cut long copy (email template *Message*, campaign subject) | the email template and campaign editors |
