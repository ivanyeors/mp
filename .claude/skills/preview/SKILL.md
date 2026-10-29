---
name: preview
description: Run this site for real on made-up sample data, take desktop and phone screenshots of its pages, and show them to the user. Use it every time you change something a person sees (a page, component, layout, style, chart, copy, empty state) before you say the work is done, and whenever someone asks to run, preview, show, check or screenshot a page. Works on any Admin Panel or public page; signs in as an Owner for you.
---

# Preview: see what you changed

Screenshots are how the user follows the work. After any change a person can
see, take them, look at them yourself, fix what looks wrong, and send them.
Tests passing is not the same as the page looking right.

```bash
.claude/skills/preview/preview shoot /settings/analytics "/settings/analytics?tab=stock"
```

That one command starts everything it needs (about a minute the first time,
seconds after), signs in, and saves a desktop (1440 px) and a phone (390 px)
full-page PNG of each page under `.preview/shots/<time>/`. It prints one line
per screenshot, `ok` or `PROBLEM` with what went wrong.

## Every time

1. **Pick the pages your change shows up on.** The page you edited, plus any
   other page using a component you changed. A path is enough: `/settings/orders`
   becomes `/en-US/settings/orders`. Keep query strings in quotes.
2. **Shoot them.** Both widths unless the change is clearly one of them.
3. **Read every PNG with the Read tool.** Check what you changed actually looks
   right: text cut off, overlapping labels, horizontal scroll on the phone,
   empty or broken cards, wrong numbers. A `PROBLEM` line means the page
   errored; fix it before anything else.
4. **Fix and shoot again** until it is right.
5. **Send them** with `SendUserFile` (one call, the PNGs that show the change),
   with a caption saying what each shows. Always say the data is sample data,
   so nobody reads a sample figure as a real one.

## Options

| Option | Does |
|---|---|
| `--desktop` / `--phone` | Only one width |
| `--as <email>` | Sign in as another fixture user. `staff@preview.local` has no permissions |
| `--signed-out` | No session, as a visitor sees it |
| `--scenario <name>` | Load a fixture scenario for this run, e.g. `empty-sales` (no orders) |
| `--click "<text>"` | Click the first element with this text before the shot. Repeat for several |
| `--wait-for "<text>"` | Wait until this text shows before the shot |
| `--element "<css>"` | Crop to one element, e.g. `"[data-slot=card]:has-text('Margin')"` |
| `--viewport-only` | The first screen only, not the full page |
| `--dark` | Dark colour scheme |
| `--name <file>` | File name instead of one made from the path |
| `--out <dir>` | Save somewhere else |
| `--keep-data` | Keep writes from an earlier run (each run starts from clean fixtures) |
| `--plan <file.json>` | Many shots in one run: `[{"path": "...", "name": "...", "clicks": ["..."], "waitFor": "...", "element": "..."}]` |

Other commands: `preview start`, `preview stop`, `preview status`,
`preview logs` (the dev server's and fake Supabase's), `preview reset
[--scenario x]`, `preview selftest`, `preview skip "<why>"`.

Leave it running between shots; `preview stop` when you are finished with the
session's UI work.

## What is real and what is not

- **The app is real**: `next dev` on this branch, every page, server action,
  loader and component unchanged, on port 3100.
- **Supabase is a stand-in** (`lib/fake-supabase.mjs`) on `127.0.0.1:54329`.
  It answers supabase-js the way PostgREST and Supabase Auth do: embeds follow
  the foreign keys in `supabase/migrations`, filters, `or()`, order, ranges,
  counts, `single()`, inserts, updates, upserts and deletes. Writes last until
  the next run.
- **The data is made up**, from `fixtures/*.mjs`. Item names are the real
  catalog's; every order, quantity, payment, customer and answer is invented.
- **Nothing real is reachable.** The app's keys are withheld from the dev
  server (it is started without them, and any in an `.env` file are blanked),
  so Stripe, email, Google, Meta and the rest see no credentials. Storage
  images come back as grey squares. Realtime is off.

## When the fake database has nothing

After the screenshots, the run lists what the page asked for that had no
sample data:

```
  - read "inventory_balances", which is not a table in the migrations (a view?) and has no sample rows
  - rpc "seo_metric_rollup" has no stand-in; answered [] (add one under rpc in a fixture if the page needs it)
```

That is how an empty card in a screenshot is explained. If the page you
changed needs those rows to show your change, add them to a fixture.

## Adding sample data

A fixture is a file in `fixtures/` exporting a function of `{ scenario, now }`
that returns any of `tables`, `views`, `rpc` and `users`. Files load in name
order; rows for one table from several files are added together. Add to the
file for that area, or make a new one (`fixtures/<area>.mjs`):

```js
export default function shop({ scenario, now }) {
  return {
    tables: {
      // Column names as in supabase/migrations. Unlisted columns are simply absent.
      product_images: [{ id: "img-1", product_id: "prod-pillow-premium", url: "https://…", position: 0 }],
    },
    // A view, worked out from the tables on every read.
    views: { variant_stock: (t) => t.product_variants.map((v) => ({ variant_id: v.id, on_hand: 12 })) },
    // A Postgres function: (args, { rows, tables, user }) => result. Sets are arrays of rows.
    rpc: { seo_metric_rollup: ({ p_source }) => [] },
  };
}
```

- **Made-up data only.** Never copy rows from production: no real customer,
  order, email, phone, address, payment or answer. Invent them.
- **Dates relative to `now`**, so the default period always has data
  (`fixtures/analytics.mjs` builds the last six Singapore months).
- **Seed randomness** (`rng(seed)` in `fixtures/analytics.mjs`) so every run
  draws the same pictures.
- **A scenario** is a state worth showing, like `empty-sales`. Read `scenario`
  in the fixture and return different rows.
- Embeds resolve through foreign keys. A row may also carry the related row
  nested under the embed's name (`{ ..., products: { product_type: "pillow" } }`).

## When something goes wrong

- **`PROBLEM … HTTP 500` / `page error` / `server:`**: the page itself failed.
  `preview logs` shows the dev server's stack. Often the page needs a row or
  RPC the fixtures do not have, or a column a fixture row lacks.
- **Redirected to sign-in**: the session was refused. `preview selftest` checks
  the stand-in, including sign-in.
- **The first shot of a page takes a minute**: Next compiles each route on its
  first visit. Later shots are fast.
- **`node_modules is missing`**: install dependencies first (`pnpm install`).
- **A port in use**: `preview stop`, or set `PREVIEW_PORT` /
  `PREVIEW_SUPABASE_PORT`.
- **After changing `lib/`**: run `preview selftest`, which drives the stand-in
  with the real supabase-js client.

## The reminder at the end of a turn

A Stop hook (`hooks/stop-check`, wired in `.claude/settings.json`) checks
whether files that render pages (`app/**/*.tsx`, `app/[lang]/**/*.ts`,
`components/`, `hooks/`, `lib/**/*.tsx`, styles, `public/`) changed since the
last screenshots this session. If they did, it sends you back once to take
them. When a change has nothing to look at (a type rename, a refactor with no
visible effect), run `preview skip "<why>"` and say so in one line.
