# Google Form fittings are imported as Staff-only Fitting records on the Customer

Status: Accepted (owner, 2026-10-31)

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

- **A customer can read every column of their own `customers` row**
  (`0037_customer_auth.sql:15-18`). Blood pressure, acid reflux and sleep symptoms are health
  answers written for Staff. They cannot go there.
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

- **(a) One Fitting record per form row, in `customer_fittings`, Staff-only.** RLS on, no policy,
  no grant to `anon` or `authenticated`, as `migrated_customers`. It keeps every answer the form
  had: the measurements in inches as recorded, size, configuration type, profile side, sleeper
  type, symptoms, health and bed answers, age group, gender, how they heard of us, who referred
  them, who serviced them (linked to a **Staff profile** when the name matches one), notes, the
  name, email and mobile as typed, and the Drive file ids. A column the import does not know is
  kept in `other_answers` under its header, so a later version of the form loses nothing.
- **(b) It is not a Result, an Order or a Purchase.** It never enters the money path, the
  Results queue, analytics, the **Lifecycle stage** or `customers.total_*`.
- **(c) Matching: email first, then mobile.** A row with a usable email attaches to the
  **Customer** holding it, or creates one (no login: [ADR 0029](0029-shopify-customer-migration.md) b).
  A row without one attaches to the one **Customer** whose mobile is the same number. When no
  Customer, or more than one, has it, the row is skipped and listed for Staff to follow up. A
  phone-only Customer is never created. Platform data wins: a match fills only a null name or
  phone, and changes nothing else.
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

## Considered options

- **Import each row as a Result** — rejected; see Context. It would need a status no Result has,
  and every reader of `mp_config_responses` would have to learn to ignore it.
- **One Customer note per row** — rejected. Quick, but not structured: no reading a size or a
  measurement back, and notes are capped at 5,000 characters.
- **Fields on `customers`** — rejected. The customer can read their own row.
- **Creating phone-only Customers** — rejected. It touches sign-in, checkout, campaigns and every
  reader that assumes an email, and such a Customer could never sign in.
- **Copying the photos into Storage** — rejected for now. Previews from Drive need no storage, no
  copy to keep in step and no second home for the photos. Copying stays possible later from the
  stored file ids.

## Consequences

- Glossary: **Fitting record** and **Fitting import** in `CONTEXT.md`.
- The Shopify import's undo reads every foreign key to `customers`, so a Shopify-created
  Customer who has a Fitting record is kept on that undo, as it should be.
- The preview of a photo depends on the platform's Google account being able to read the form's
  upload folder. Sharing that folder with it is the owner's one-time setup.
- The form's timestamp has no time zone. It is read as Singapore time (UTC+8, no daylight
  saving), and the date order (month first or day first) is read from the file, or chosen by
  Staff when every date in the file fits both.
