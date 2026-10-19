# 02 — Import tables and a dry-run importer that reports and never writes

**Type:** AFK
**Blocked by:** 01
**User stories:** 9
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:db`

## Goal

Read a real Shopify export and say exactly what an import *would* do, row by row, without
touching the database. The owner should be able to run this on day one and see their true skip
counts before anything else is built.

## Schema (one migration, `YYYYMMDDHHMMSS_customer_import.sql`)

```sql
create table customer_import_batches (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('shopify_customers_csv')),
  file_sha256   text not null,
  rows_total    int  not null,
  created       int  not null default 0,
  merged        int  not null default 0,
  already_imported int not null default 0,
  skipped       jsonb not null default '{}',   -- { reason: count }
  run_by        text not null,                 -- operator label, not an email
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
```

RLS is enabled on both tables, with only a service-role policy, matching the
`Service role full access` pattern (scoped to `service_role` since `20260902000000`). There is
deliberately **no** `authenticated` policy (ADR 0026 d).

## Importer

`scripts/import-shopify-customers.ts`, run as
`npx tsx --env-file=.env.local scripts/import-shopify-customers.ts --in <path>`. It is **dry-run
by default**, following the convention of `scripts/costings-sync-prices.ts`.

The pure logic lives in `lib/customer-migration/`, so vitest can cover it without a database:

- `shopify-csv.ts`: parse, check the header row, normalise.
- `plan.ts`: `planCustomerRow(row, existing) → create | merge | already_imported | skip(reason)`.

### Input guard

- Refuse a path that git tracks, or a path inside the worktree that git does not ignore (use
  `git check-ignore`). Add `info/private/` to `.gitignore` as the suggested drop folder.
- Refuse a header row that lacks any required column (`Email`, `First Name`, `Last Name`,
  `Accepts Email Marketing`, `Total Orders`, `Total Spent`). List what is missing and exit
  non-zero. Optional columns that are absent are reported, not fatal.
- Record the SHA-256 of the file.

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
| `Accepts SMS Marketing`, `Tax Exempt` | Dropped (data minimisation: we do not market by SMS and do not tax-exempt). |

### Plan rules (`planCustomerRow`)

1. **`already_imported`**: `migrated_customers` already holds this `shopify_customer_id`. Do
   nothing.
2. **`skip: email_already_migrated`**: the email belongs to a Migrated customer with a
   *different* Shopify id.
3. **`merge`**: a `customers` row exists with this `lower(email)`, claimed or not. Fill only the
   null `first_name` / `last_name` / `phone`. Add the address only if the Customer has none.
4. **`create`**: there is no row with this email.

### Dry-run output

- Counts by outcome and by skip reason.
- Counts of each repair (`zip_repaired`, `phone_dropped`).
- How many rows are buyers (`Total Orders ≥ 1`) and how many have marketing consent.
- **No PII on stdout.**
- A `skipped.csv` written next to the input file, outside git, so the owner can inspect the
  skipped rows.

## Acceptance criteria

- [ ] The migration applies cleanly. Both tables have RLS on, with no `authenticated` or `anon`
      policy.
- [ ] vitest covers every normalisation rule and every plan outcome, including: BOM, a
      leading `'`, an `018956` zip read back as `18956`, a duplicate email, a phone-only row, an
      existing claimed Customer (`merge`), and a re-run (`already_imported`).
- [ ] Running against a tracked or un-ignored path exits non-zero before reading the file.
- [ ] A dry run against a 5-row fixture prints counts that sum to `rows_total`.
- [ ] The importer makes **no** insert, update or delete in this slice, and imports nothing from
      `supabase.auth.admin`.
- [ ] `./scripts/graphify update .` is run in the same commit.
