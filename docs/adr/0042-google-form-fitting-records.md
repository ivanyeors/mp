# Google Form fittings are imported as Fitting records on the Customer

Status: Accepted (owner, 2026-10-31). Amended (owner, 2026-11-01): the customer sees their own
Fitting records on their Profile, without the Drive photos (h); and one person's many visits,
each with its own measurements, all land on one Customer (c, i). Amended (owner, 2026-11-05): the
Customer page draws the pillow a fitting names in the x-ray, and Staff can link another (j); the
customer sees it on their Profile once something says they bought it, and a pillow bought here is
drawn as it was built (k). Amended (2026-11-07): Staff change the fillings in that pillow at a
Re-adjustment visit, and it is drawn as they left it (l). Amended (owner, 2026-11-08): a fitting
dates a Migrated customer's Shopify-era purchases for the Lifecycle stage (m).

Before this platform, every in-store fitting was typed into a Google Form: the customer's name,
mobile and email, the four measurements (A to D, in inches), the recommended pillow size, the
configuration type (`T12`) and profile side (`M-LN`), the sleep and health answers, who serviced
them, notes, and Drive links to the back and side photos, the sleep previews and the
customisation form. Staff cannot see any of it on the Customer page, so a returning customer is
measured from scratch, and a **Re-adjustment** starts without knowing what was built.

This record decides where those rows live and how they arrive. Each form row becomes one
**Fitting record** linked to a **Customer**, imported from the owner's CSV export on the Admin
Panel. The file stays in the browser, as the Shopify import's does ([ADR 0029](0029-shopify-customer-migration.md)).

## Context

- **A customer can read every column of their own `customers` row** from the browser
  (`0037_customer_auth.sql:15-18`). A record also holds what is not theirs to read: the Drive
  file ids of the form owner's folder, and how the import found them. So the answers cannot go
  there; the customer gets only what the server picks for them (h).
- **A Result is a money object.** `mp_config_responses` drives the Results queue, the SLA cron,
  holds, Accept, analytics and the customer's own Results list. A historical form row has no hold,
  no build and no payment, and would show up in all of those.
- **`customers.email` is NOT NULL and unique** (`0028_ecommerce.sql:214,227`). An in-store form
  row may have a mobile number and no email.
- **The form's configuration types and profile sides are not modelled here.** The platform builds
  from **Filling Templates** and **Placements**, and the Rules Engine reads centimetres. `T12` and
  `M-LN` are the old studio's codes, and only Staff read them.
- **The photos are on Google Drive**, in the form owner's account. The platform already reads
  Drive with its own OAuth client (`lib/media-assets/drive.ts`).

## Decisions

- **(a) One Fitting record per form row, in `customer_fittings`, read by the service role only.** RLS on, no policy,
  no grant to `anon` or `authenticated`, as `migrated_customers`. It keeps every answer the form
  had: the measurements in inches as recorded, size, configuration type, profile side, sleeper
  type, symptoms, health and bed answers, age group, gender, how they heard of us, who referred
  them, who serviced them (linked to a **Staff profile** when the name matches one), notes, the
  name, email and mobile as typed, and the Drive file ids. A column the import does not know is
  kept in `other_answers` under its header, so a later version of the form loses nothing.
- **(b) It is not a Result, an Order or a Purchase.** It never enters the money path, the
  Results queue, analytics or `customers.total_*`, and it is never counted as a Purchase. With a
  Shopify-era order, it dates one for the **Lifecycle stage** (m).
- **(c) Matching: email first, then mobile; one person, one Customer.** A customer comes back,
  and each visit is another form row with its own measurements. Every one of them is its own
  Fitting record on the same Customer (owner, 2026-11-01).
  - A row with a usable email attaches to the **Customer** holding it.
  - Under an email no Customer holds (a new one, or a typo), it attaches to the one Customer with
    the same mobile and the same name, matched by mobile.
  - Otherwise it creates a Customer (no login: [ADR 0029](0029-shopify-customer-migration.md) b).
  - A row without an email attaches to the one **Customer** whose mobile is the same number. When
    several share the number, it attaches to the one of them with the same name.
  - Otherwise the row is skipped and listed for Staff to follow up.

  Names compare ignoring case and spacing, and a Customer's name is first and last joined
  (`fitting_name_key`, 20261101100000).

  Rows are imported with every row that has an email first, then the rest, each in file order.
  So a visit noted with only a mobile finds the Customer another visit's email creates, wherever
  it sits in the file.

  A phone-only Customer is never created. Platform data wins: a match fills only a null name or
  phone, and changes nothing else; a Customer's email is never changed by a later visit's.
- **(d) The import key is the form row itself:** its timestamp, contact and name, hashed. The
  same file imported twice creates nothing, and two fittings of one person on different days are
  two records.
- **(e) Same import discipline as ADR 0029 (a, e).** The file is read in the browser and never
  uploaded or stored; rows go up in chunks, each chunk is one transaction in a SQL function that
  re-decides every row against the rows as they are then, the batch reconciles before it is
  marked applied, and Undo removes the batch's Fitting records and the Customers it created that
  nobody has signed in to or referenced since. Guarded by `customer-import`.
- **(f) Photos are previewed through the platform, from Drive, and never copied.** A Staff-only
  route fetches the file with the platform's Drive OAuth client, only when the file id is on a
  Fitting record of that Customer, and returns a resized image marked `private, no-store`. When
  Drive refuses (the platform's Google account cannot see the form owner's folder), the card says
  so and links to Drive instead.
- **(g) Seen by whoever holds `customers`**, on the Customer page (Fitting history) and as one
  entry on the **Customer timeline** at the fitting's own time.
- **(h) The customer sees their own Fitting records on their Profile** (owner, 2026-11-01), in
  the same Fitting history card: the measurements, every answer (health answers included: they
  are the customer's own), who serviced them, the notes and the other answers. Not the Drive
  files. The Profile reads the records with the service role, by the **Customer** the session is
  linked to and never by anything the request names, and copies them field by field into a view
  with no Drive file, nothing about how the import found the Customer (match, contact as typed),
  and no other answer that is an upload question's cell or a Google file link. None of it
  reaches the browser. The photo route stays Staff-only.
- **(i) Several visits read as one history** (owner, 2026-11-01). The Fitting history card,
  for Staff and on the Profile, lists one person's visits newest first. With more than one, the
  newest is marked Latest, and each measurement that changed shows what it was at the visit
  before.
- **(j) The Customer page draws their pillow in the x-ray** (owner, 2026-11-05): the **Pillow on
  record**. The form's configuration types are the catalog's Filling Templates by name (`T12` is
  `Type-12`, `8A` is `Type-8a`), and a profile side ending `-SN` is a template's `(Short Neck)`
  variant, so the latest fitting that names a type is read as the active pillow template of that
  type and neck serving the fitting's size (`lib/customer-pillow/match.ts`). This narrows the
  Context's "not modelled here": the codes stay on the record as typed, and the match is worked
  out on every read and never stored, so a template renamed, added or given another size is
  picked up at once. When no template is exactly that, the nearest is drawn — another size's
  (the most common case: `Type-12` and `Type-15` serve L and XL, while most fittings recorded S
  or M) or the other neck's — and the card says so. A Staff member holding `customers-edit` can
  link a size and template instead, or a size alone, for any Customer, a Shopify one with no
  fitting included; the link is one row in `customer_pillows`, service-role only like
  `customer_fittings`, and removing it goes back to the fitting's. The template is drawn as it
  is now: this describes the pillow they have, it is not a Result, and it reaches no price,
  stock or analytics. The Profile shows it only as (k) says.
- **(k) The customer sees their pillow on their Profile once they bought it** (owner,
  2026-11-05). Something must say they bought one (`pillowOwnership`,
  `lib/customer-pillow/bought.ts`):
  - a pillow on a counted Order here (`customer_purchase_lines`) with a unit not returned;
  - a Staff link, which records the pillow they have; or
  - from before this platform, a Fitting record and at least one Shopify order on their
    **Migrated customer** row. The Shopify export counts orders and spend, not what was in
    them, and the Shopify order mirror has no customer, so this is the one Shopify-era fact
    there is. A fitting with an order is read as the in-store purchase it almost always was
    (in production, 1,238 of the 1,419 fitted customers, median Shopify spend $480).

  A fitting alone, or Shopify orders alone, is not enough, and neither is a Result that was
  never paid. A pillow bought here also becomes the **Pillow on record**: after a Staff link and
  before the fitting, it is the latest such pillow, drawn from the build its order line froze at
  Accept (`filling_placements`, its size and template name), not from the template as it is now.
  The Profile reads it with the service role, by the **Customer** the session is linked to, and
  copies it field by field into a view with the size, the template's name, the order number or
  fitting date, the placements and the placed Items' names (`ownPillowView`). Not who linked it,
  the match notices, the fitting's codes, the templates Change offers, or any cost. It is drawn
  read-only in the same x-ray as the Customer page, which says whether the Profile shows it.
- **(l) Re-adjust changes the fillings in the pillow they have** (asked 2026-11-07). At a
  **Re-adjustment** visit Staff re-tune the pillow by swapping, adding or taking out pieces. A
  Staff member holding `customers-edit` searches the customer, and **Re-adjust**, beside Change
  pillow on the Customer page, opens the **X-ray editor** on the pillow drawn there (a link's
  template, an order's build, a fitting's match, or the last Re-adjustment), with the left, centre
  and right cuts side by side, its **Derived pack list**, and a list of the counts that changed.
  (Amended, owner, 2026-11-15: the **Insert order** replaces the pack list here, one column per
  Section under its cut, each piece with its bin, because a count per filling could not say which
  Section a piece to take out was in. A pouch also comes out from the x-ray itself: its bin once
  selected, Delete, or dragged off the x-ray, drawn red as it goes.)
  The read-only card draws the same three cuts under its x-ray, on the Customer page and the
  Profile. Save writes the mix they
  leave in it onto the Staff link, as `customer_pillows.filling_placements`, rows shaped like
  an order line's frozen build, with the size and the template it was re-adjusted from. From
  then on the link is drawn from that mix, not from the template as it is now, and the card and
  the Profile say it was re-adjusted, and when. The mix is checked as a **Result**'s is (cells,
  Layers, pieces, placeable Items) but with no **Tier**: the pillow on record has none. Change
  pillow replaces it with a template again, and removing the link goes back to the order's or
  the fitting's. A Re-adjustment is a **Service**: it moves no stock, sets no price, and reaches
  no Result, order or analytics; its fee is charged when it is booked. Each save is in the audit
  log (`customer_pillow.readjust`) with the mix before and after, which is the only history
  kept: the card shows the latest.

- **(m) A fitting dates the Shopify-era purchase** (owner, 2026-11-08: "use our customer form
  timestamp to mark the import as a purchase date of the products if there is any orders"). The
  Shopify export counts a Migrated customer's orders but carries no dates, so a buyer whose every
  purchase was Shopify-era was placed by count alone, *no dates yet*, and could never be *At
  risk*. (k) already reads a fitting with an order as the in-store purchase it almost always was,
  so the latest Fitting record's timestamp now dates the latest of those orders:
  - The Customer overview's latest purchase (`last_purchase_at`) is the later of the latest
    purchase here and, when the Customer has Shopify-era orders, their latest fitting. A tie is
    the purchase here (`20261108100000_fitting_dated_purchases.sql`; `latestPurchase` in
    `lib/crm/lifecycle-stage.ts`). The Stage, *Last order* and Unengaged filters, the lifecycle
    chart and the campaign blocker all read it.
  - The count is unchanged: the Shopify-era order count is still added to **Purchases**, and the
    fitting dates only the latest of them. A fitting with no Shopify-era order is still no
    purchase.
  - A fitting-dated purchase was in hand at the fitting, so for the *New* sub-status its delivery
    is the fitting too (*Settled* 30 days after). `last_delivered_at` keeps deliveries made here:
    the *Delivered* filter and the review request timing are about those.
  - The Customer page shows the date under *Last purchase* with "Fitting, on Shopify".
  - Derived on every read, never stored: a later Fitting import or Undo moves it at once.

  In production on 2026-11-08 this dated 1,242 of the 1,617 Migrated customers with Shopify-era
  orders. 1,014 were last fitted over 12 months ago and moved from *New* or *Loyal* to *At risk*
  (698 of them *Lapsed*, over 24 months). The 375 with no fitting stay placed by count. This is
  the lighter half of PRD-crm-retention-loop slice 09: it gives dates, not what was bought.

## Considered options

- **Import each row as a Result** — rejected; see Context. It would need a status no Result has,
  and every reader of `mp_config_responses` would have to learn to ignore it.
- **One Customer note per row** — rejected. Quick, but not structured: no reading a size or a
  measurement back, and notes are capped at 5,000 characters.
- **Fields on `customers`** — rejected. The customer can read their own row.
- **A new Customer for every email** — the first version (2026-10-31). One person who gave a
  second email, or mistyped it, became two Customers, and each Profile showed half their visits.
  Replaced by matching on mobile and name (c). Mobile alone is not enough under another email: a
  family shares a number more often than a person changes their email.
- **Creating phone-only Customers** — rejected. It touches sign-in, checkout, campaigns and every
  reader that assumes an email, and such a Customer could never sign in.
- **Keeping the records from the customer** — the first version (2026-10-31). Reversed by the
  owner: the customer should see what they told us at each fitting (h).
- **Showing every customer their pillow, bought or not** — rejected by the owner (k): the
  filling is what they pay for. **Only pillows bought here**, or **only those and Staff
  links**, were also offered: nobody has bought a pillow here yet, so either would hide it from
  every customer who bought before the switch.
- **Showing the customer their photos too** — rejected by the owner. The files live in the form
  owner's Drive, and the route that previews them is for Staff.
- **A Re-adjustment history table** (l) — not yet. One row per visit, linked to its
  **Re-adjustment booking**, would let Staff read every change made over the years. Today the
  link holds the latest mix and the audit log the ones before it; a table can be filled from
  that log later.
- **Moving stock for a Re-adjustment's pieces** (l) — not done. A **Service** consumes no
  inventory in this model. If the pieces taken out and put in should count, that is a
  decision for the owner and a stock movement of its own, not a side effect of this save.
- **Dating by the earliest fitting** (m) — rejected. A later visit is usually a re-adjustment or a
  second pillow, and either is the last time we saw them, which is what *At risk* measures.
- **Importing the Shopify orders export instead** (m) — not instead, still possible
  (PRD-crm-retention-loop slice 09). It would date the 375 with no fitting and say what each
  order held. The fitting dates what can be dated from what is already here.
- **Copying the photos into Storage** — rejected for now. Previews from Drive need no storage, no
  copy to keep in step and no second home for the photos. Copying stays possible later from the
  stored file ids.

## Consequences

- Glossary: **Fitting record** and **Fitting import** in `CONTEXT.md`.
- The Shopify import's undo reads every foreign key to `customers`, so a Shopify-created
  Customer who has a Fitting record is kept on that undo, as it should be.
- A row with no email attaches by mobile (c). When a family shares one number and only one of
  them is a Customer, the account holder sees the other person's fitting on their Profile. Today
  Staff can only undo the whole import.
- A visit under another email, the same mobile and the same name is that person's (c). Two
  people with one name and one number would share a Customer; the form row's own email stays on
  the Fitting record for Staff to see. A name written differently (`Mei` and `Mei Tan`) is not
  matched, and the visit becomes its own Customer, as before.
- The preview of a photo depends on the platform's Google account being able to read the form's
  upload folder. Sharing that folder with it is the owner's one-time setup.
- A Shopify-era buyer last fitted over 24 months ago is *At risk · Lapsed* (m), so after 6
  unclicked campaign emails they are **Unengaged** and left out of campaigns that don't include
  the Unengaged, as any Lapsed customer is.
- The form's timestamp has no time zone. It is read as Singapore time (UTC+8, no daylight
  saving), and the date order (month first or day first) is read from the file, or chosen by
  Staff when every date in the file fits both.
