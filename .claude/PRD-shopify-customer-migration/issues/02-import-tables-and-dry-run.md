# 02 — Import tables, and an Admin Panel upload that previews and never writes

**Issue:** [#266](https://github.com/ivanyeors/mp/issues/266) (parent #264)
**Type:** AFK
**Status:** built in `a143d5c` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 01
**User stories:** 9, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

The owner opens **Admin Panel → Customers → Import from Shopify**, picks the Shopify export, and
sees exactly what an import *would* do, row by row, without anything being written. They can do
this on day one, with no developer and no terminal, and see their true skip counts before
anything else is built.

## Schema (one migration, `YYYYMMDDHHMMSS_customer_import.sql`)

```sql
create table customer_import_batches (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('shopify_customers_csv')),
  file_name     text not null,                 -- as picked in the browser, for the history list
  file_sha256   text not null,                 -- computed in the browser; a label, not a control
  rows_total    int  not null,
  rows_done     int  not null default 0,       -- resume point (slice 03)
  with_addresses boolean not null default true, -- false = the conservative import (slice 03)
  created       int  not null default 0,
  merged        int  not null default 0,
  already_imported int not null default 0,
  skipped       jsonb not null default '{}',   -- { reason: count }
  run_by_user_id    uuid null references auth.users(id) on delete set null,
  run_by_profile_id uuid null references mp_staff(id) on delete set null,
  applied_at    timestamptz,
  rolled_back_at timestamptz,
  created_at    timestamptz not null default now()
);

create table migrated_customers (
  customer_id          uuid primary key references customers(id) on delete cascade,
  shopify_customer_id  bigint unique,
  batch_id             uuid not null references customer_import_batches(id),
  created_by_import    boolean not null,        -- false = merged into an existing Customer
  created_address_id   uuid null references customer_addresses(id) on delete set null,
  shopify_orders_count int not null default 0,
  shopify_amount_spent numeric(12,2) not null default 0,
  shopify_tags         text[] not null default '{}',
  shopify_note         text null,
  email_marketing_at_export text not null check (email_marketing_at_export in ('yes','no')),
  exported_at          date not null,           -- the export's date, for consent provenance
  imported_at          timestamptz not null default now(),
  claimed_at           timestamptz null
);
create index on migrated_customers (claimed_at);
create index on migrated_customers (batch_id);
```

Both tables are server-only, as the newest tables are (`20261019152211`, `20261020024120`):
RLS is enabled with **no** policy, and `revoke all … from anon, authenticated`
(`20260917033807_security_advisor_hardening.sql:43-72`). The service role bypasses RLS. There is
deliberately no `authenticated` access (ADR 0029 d). The batch records who ran it by
`run_by_user_id` and `run_by_profile_id`. It never stores a customer's email or name.
(`admin_audit_log` does store the Staff member's own `actor_email`, `lib/auth/audit.ts:40`; that
is Staff data, not customer PII.)

## Permission

Add one catalog entry to `lib/auth/permissions.ts`, as a tab of the Customers page, following
`categories`:

```ts
{ key: "customer-import", label: "Customer import (Customers page)", group: "Store", surface: "admin-panel", requires: ["customers"] },
```

- Owner and Admin hold it through `grants_all`. No other role holds it until someone ticks it on
  **Users & permissions → Roles**. Manager and Staff can see Customers, but cannot bulk-write
  them.
- Once CRM slice 10 adds `customers-edit` (`PRD-customer-crm`), this key becomes
  `requires: ["customers-edit"]`: importing is a change.
- Check that `lib/auth/__tests__/permissions.test.ts` still holds. The new key is a gain for
  Owner and Admin only, which is what `ALL` already means.

## The page

`/[lang]/settings/customers/import`, guarded by `requireAdminPage("customer-import", locale)`.
The Customers page header gains an **Import from Shopify** button, shown only to Staff who hold
the key.

1. **Pick the file.** The page uses an `<input type="file" accept=".csv">` and refuses anything
   over 20 MB. The browser reads it (`file.text()`) and computes its SHA-256 with
   `crypto.subtle.digest`. **The file itself is never uploaded or stored**: not to Storage, not
   to Media, not to Drive. It lives only in this tab's memory and is gone when the tab closes.
   The page says so in one line.
2. **Check the header, instantly, in the browser.** The required columns are `Email`,
   `First Name`, `Last Name`, `Accepts Email Marketing`, `Total Orders` and `Total Spent`. If any
   is missing, the page lists what is missing and stops. An absent optional column is listed as
   a note, not an error.
3. **Drop what we do not use, before anything leaves the browser.** Only the columns in the
   normalisation table below are sent. `Accepts SMS Marketing` and `Tax Exempt` never reach the
   server.
4. **Preview against live data.** The browser sends the rows in chunks of 250 to the server
   action `previewShopifyImport(rows)` (`app/[lang]/settings/customers/import/actions.ts`). The
   action:
   - calls `assertAdmin("customer-import")` on every chunk;
   - re-normalises every row itself, never trusting the browser's normalisation;
   - looks up existing Customers by `lower(email)`, and existing Migrated customers by Shopify
     id;
   - returns `{ i, outcome, reason?, repairs[] }` per row, keyed by the row's index. It sends no
     PII back: the browser already holds the row.
5. **Show the plan.** The page shows:
   - cards for *would create*, *would merge*, *already imported* and *skipped*;
   - each skip reason and each repair (`zip_repaired`, `phone_dropped`) with its count;
   - buyers (`Total Orders ≥ 1`) against non-buyers, and consented against not consented;
   - a table of the skipped rows (email, name, reason) built from the browser's own copy;
   - **Download skipped rows**, a CSV the browser builds, so nothing extra touches the server.

The **Import** button that applies the plan arrives in slice 03. In this slice the page ends at
the preview.

### Why chunks, and why not raise the limit

The precedent for a CSV import from the Admin Panel reads the file with `f.text()`
(`app/[lang]/settings/analytics/SearchVisibilityCard.tsx:74`) and sends the whole text to a
server action in one call (`seo-actions.ts:309`). That cannot work here. Next.js caps a server
action body at 1 MB by default, `next.config.ts` sets no `serverActions.bodySizeLimit`, and a
Shopify export passes 1 MB at around 3,000 customers. Chunks of 250 rows stay near 100 KB and
keep every call short. Do not raise the global limit for one page.

## Pure modules (`lib/customer-migration/`)

These have no Node or Supabase imports, so they run in the browser and on the server, and
vitest covers them without a database.

- **`shopify-csv.ts`**: `parseShopifyCustomersCsv(text)`, which returns the header check and the
  raw rows, plus `normaliseShopifyRow(raw)`. Reuse `parseCsv` (`lib/seo-metrics/csv-import.ts:42`,
  RFC 4180 with BOM handling). This is its second caller, so lift it to `lib/csv.ts` and
  re-export it from the SEO module.
- **`plan.ts`**: `planCustomerRow(row, existing) → create | merge | already_imported | skip(reason)`.

### Normalisation rules

| Field | Rule |
|---|---|
| any cell | Strip a UTF-8 BOM and the leading `'` that Shopify's "CSV for Excel" variant adds; trim. |
| `Email` | Lowercase. Empty becomes `skip: no_email`; malformed becomes `skip: invalid_email`. The same email twice in one file skips **both** (`duplicate_email_in_file`) rather than guessing. |
| `Customer ID` | `bigint`; absent or blank becomes null (email is then the key). |
| names | Trim; empty becomes null. |
| `Phone` / `Default Address Phone` | Keep valid E.164. An 8-digit SG number starting 6, 8 or 9 gets `+65`. Anything else is dropped and counted (`phone_dropped`). Phone is never a key. |
| address | Requires `Address1`, `Zip` and `Country Code`, otherwise no address (`address_incomplete`). `recipient` = first + last, falling back to `Company`. `city` falls back to `Singapore` when the country is `SG`. A 5-digit numeric SG zip is left-padded to 6 and counted (`zip_repaired`). |
| `Country Code` | ISO-2, uppercase. Never left to the column default (PRD trap 3c). |
| `Total Orders` / `Total Spent` | int / numeric; unparseable becomes 0 and is counted. |
| `Tags` | Split on commas and trimmed, into `shopify_tags` only. |
| `Note` | Copied as-is into `shopify_note` only. |
| `Accepts SMS Marketing`, `Tax Exempt` | Dropped in the browser (data minimisation: we do not market by SMS and do not tax-exempt). |

### Plan rules (`planCustomerRow`)

1. **`already_imported`**: `migrated_customers` already holds this `shopify_customer_id`. Do
   nothing.
2. **`skip: email_already_migrated`**: the email belongs to a Migrated customer with a
   *different* Shopify id.
3. **`merge`**: a `customers` row exists with this `lower(email)`, claimed or not. Fill only the
   null `first_name` / `last_name` / `phone`. Add the address only if the Customer has none.
4. **`create`**: there is no row with this email.

## Acceptance criteria

- [x] The migration applies cleanly. Both tables have RLS on, with no `authenticated` or `anon`
      policy.
- [x] `customer-import` is in the catalog. A Manager or Staff session gets the denied page at
      `/settings/customers/import` and does not see the button. Owner and Admin do.
- [x] vitest covers every normalisation rule and every plan outcome, including: BOM, a
      leading `'`, an `018956` zip read back as `18956`, a duplicate email, a phone-only row, an
      existing claimed Customer (`merge`), and a re-run (`already_imported`).
- [x] A file missing a required column is refused in the browser before any server call.
- [x] Previewing a 5-row fixture shows counts that sum to the row count.
- [x] A 5,000-row fixture previews in chunks, with no call over 1 MB.
- [x] The preview makes **no** insert, update or delete, writes no file anywhere, and imports
      nothing from `supabase.auth.admin`.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

**What was built.**

- `lib/csv.ts`: `parseCsv` lifted from `lib/seo-metrics/csv-import.ts` (which re-exports it),
  plus `csvCell` / `toCsv` for the download.
- `lib/customer-migration/shopify-csv.ts`: `parseShopifyCustomersCsv` (header check; a raw row
  holds only the columns the import reads, so `Accepts SMS Marketing`, `Tax Exempt` and any other
  column are dropped at parse) and `normaliseShopifyRow`.
- `lib/customer-migration/plan.ts`: `planCustomerRow`, plus the bulk helpers the server action
  and the browser share (`normaliseRows`, `duplicateSkips`, `lookupKeys`, `planRows`,
  `existingFromMatches`).
- `lib/customer-migration/preview.ts`: the whole browser flow apart from the server action
  (`runShopifyPreview`), chunking, the server's chunk check (`readPreviewChunk`), the counts
  (`summarisePreview`), the skipped-rows CSV and `sha256Hex`. The page passes the action in, so
  vitest drives the same flow.
- `app/[lang]/settings/customers/import/`: `page.tsx` (`requireAdminPage("customer-import")`),
  `import-client.tsx`, and `actions.ts` with `previewShopifyImport`.
- `lib/auth/permissions.ts`: the `customer-import` entry, `requires: ["customers"]`.
- Customers page: **Import from Shopify** in the header, rendered only when the page's
  `requireAdminPage` context holds `customer-import`.

**Migration.** `supabase/migrations/20261020100000_customer_import.sql`: both tables as
specified, RLS on with no policy, `revoke all … from anon, authenticated`, and the read-only
function `customer_import_preview_matches(text[], text[])` (`stable`, `security invoker`,
executable by `service_role` only). Applied to a fresh Postgres 16 with every migration, once
plain and once with Supabase's default grants to `anon` / `authenticated` in place. Verified:
no policies; neither client role can select, insert, update or delete either table or run the
function (`permission denied`), and the function's ACL has no PUBLIC entry; the service role
reads both; the CHECKs refuse a bad source, hash, consent value and `rows_done > rows_total`;
`shopify_customer_id` is unique; a batch with rows cannot be deleted; deleting the address nulls
`created_address_id`; deleting the Customer removes its row. The migration re-applies cleanly.

**Tests.**

- `lib/customer-migration/__tests__/shopify-csv.test.ts`: the header check (required, optional,
  dropped, BOM and `'` in headers, older unprefixed address columns), data minimisation, and
  every normalisation rule.
- `lib/customer-migration/__tests__/plan.test.ts`: every plan outcome, merge fills, duplicates
  by email and by Shopify id, repairs only on written rows, and reading the function's rows.
- `lib/customer-migration/__tests__/preview.test.ts`: refused header with no server call; the
  5-row fixture's counts; the 5,000-row fixture in chunks of ≤ 250 rows and < 1 MB; a duplicate
  split across two chunks; failures; the chunk check; the spreadsheet-safe download.
- `app/[lang]/settings/customers/import/__tests__/preview-action.test.ts`: `customer-import`
  on every chunk; one `rpc` and no other Supabase call; re-read keys; no PII in the answer;
  a static guard that the page, action and `lib/customer-migration/*` hold no
  insert/update/upsert/delete, no `auth.admin`, no Storage, Media or Drive import, no `fs`, no
  `fetch`, and that the SQL function only reads.
- `app/[lang]/settings/customers/import/__tests__/page-gate.test.tsx`: Manager, Fulfilment and
  Viewer (their seeded role rows through `permissionsForRoleRow`) are sent to
  `?denied=customer-import` and get no button; Owner and Admin get both.
- `lib/__tests__/csv.test.ts`.
- Fixtures are synthetic (`__tests__/fixtures.ts`): invented names, `example.com` emails.

**Deviations, and why.**

- **A read-only SQL function in the migration.** The preview must find Customers by
  `lower(email)`, and stored emails are not reliably lowercase (Staff edit them). PostgREST
  cannot filter on `lower(email)`, and 250 `ilike` filters would not fit a URL. One `stable`
  function returns, per email, the Customer, which mergeable fields are already set, and whether
  it is a Migrated customer, plus the Shopify ids already imported.
- **`duplicate_customer_id_in_file`.** The "skip both, do not guess" rule is applied to the
  other import key too. It also keeps slice 03 off the `shopify_customer_id` unique index.
- **File-wide duplicates are applied in the browser.** The server sees one chunk, so it
  finds duplicates within it; `runShopifyPreview` applies the file-wide rule over the server's
  answers. **Slice 03 must carry this into the apply** (the browser holds the file-level fact),
  or the SQL function will create the first copy and merge the second.
- **The preview sends no Tags or Note.** It never reads them, and a Shopify note may hold a
  health remark. The server also drops, on arrival, any field outside the preview's list.
  Slice 03's apply will send them.
- **Named counts.** Besides `zip_repaired` and `phone_dropped`, the counted repairs are
  `address_incomplete`, `total_orders_invalid` and `total_spent_invalid`. A row with no address
  fields at all is not counted.
- **Address completeness** also needs a recipient (names, else Company) and a city (after the
  SG fallback), because both are NOT NULL in `customer_addresses`, and an ISO-2 country.
- **Phone** reuses `normalizePhone` (`lib/appointments/phone.ts`). It also accepts an SG
  number written `65…` or `065…` without the `+`, and refuses a `+65` number that is not a real
  SG number (6, 8 or 9). `Phone` goes to the Customer and `Default Address Phone` to the address,
  with no fallback between them.
- **Consent** is `yes` only for an explicit "yes" (any case). Anything else is `no`.
- **Chunks** are capped at 512 KB as well as 250 rows, so a file with very long cells still
  stays under 1 MB per call.
- **Older exports.** The address columns also match their unprefixed names (`Address1`, `Zip`,
  `Country Code`, …). The required columns are matched by their exact names only.
- **Extra CHECKs** beyond the spec: non-negative counts and Shopify figures,
  `rows_done ≤ rows_total`, a hex SHA-256, `skipped` a JSON object.
- **Base commit.** The worktree started at `main` (`48c643f`), which has no PRD files; it was
  fast-forwarded to the integration branch (`71ca599`) before any work.

**For slice 03 and later.** `migrated_customers.exported_at` is NOT NULL, and the export's date
is not in the CSV: the apply must take it from the operator, or from `file.lastModified`.
`customer-import` becomes `requires: ["customers-edit"]` at the CRM slice 10 merge, and CRM 10's
guard test (every server action under `app/[lang]/settings/customers/**` checks
`customers-edit`) must accept `customer-import` for `previewShopifyImport`, which reads only.

**Ops / owner.** Nothing is needed for this slice. Once merged, the owner can run the preview
against a real export on **Customers → Import from Shopify**. Slice 04 records the header row it
carries.

**At merge with CRM 10:** `customer-import` now requires `customers` and `customers-edit`. Importing is a change; `customers` stays listed so the key still reads as a tab of the Customers page.
