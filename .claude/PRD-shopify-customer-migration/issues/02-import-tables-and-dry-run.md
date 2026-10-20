# 02 — Import tables, and an Admin Panel upload that previews and never writes

**Type:** AFK
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
deliberately no `authenticated` access (ADR 0028 d). The batch records who ran it by
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

- [ ] The migration applies cleanly. Both tables have RLS on, with no `authenticated` or `anon`
      policy.
- [ ] `customer-import` is in the catalog. A Manager or Staff session gets the denied page at
      `/settings/customers/import` and does not see the button. Owner and Admin do.
- [ ] vitest covers every normalisation rule and every plan outcome, including: BOM, a
      leading `'`, an `018956` zip read back as `18956`, a duplicate email, a phone-only row, an
      existing claimed Customer (`merge`), and a re-run (`already_imported`).
- [ ] A file missing a required column is refused in the browser before any server call.
- [ ] Previewing a 5-row fixture shows counts that sum to the row count.
- [ ] A 5,000-row fixture previews in chunks, with no call over 1 MB.
- [ ] The preview makes **no** insert, update or delete, writes no file anywhere, and imports
      nothing from `supabase.auth.admin`.
- [ ] `./scripts/graphify update .` is run in the same commit.
