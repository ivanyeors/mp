# Slice 03 — Roles grid: View / Edit ticks, tab rows, "what this unlocks"

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 01
Status: todo
User stories covered: 1–4, 10

## What to build

On `app/[lang]/settings/users/roles-tab.tsx`:

- **Two ticks per role on pages with an Edit key.** Each role column splits into **View** and **Edit** on rows that have an Edit key. A row without one (Audit log, Docs, Showroom, Shopify link, Telegram actions) shows a single tick.
- **Tab rows.** Edit and tab keys are no longer rows of their own. An `-edit` key is the Edit tick on its page's row. A tab row is indented under its page, with its own View and Edit ticks. Edit-only rows (`customer-import`, `campaigns-send`, and the Refund money rows `orders-refund` and `returns-refund`) are indented with only an Edit tick.
- **What this unlocks.** Under each label, one muted line from the catalog's `unlocks`.
- **Toggling.** Uses `togglePermission` unchanged. Ticking Edit ticks View; unticking View unticks Edit and the page's tab rows, with the existing toast.
- **Subset rule.** Unchanged: a tick for a key the actor lacks is disabled, with the existing reason.
- **Phone.** The per-role checklist shows each row with View and Edit switches.
- **Header copy.** "View opens a page. Edit lets them change it. New pages are off for custom roles until you turn them on." Until every page slice has landed, add: "Edit takes effect page by page."
- The grid is built from the catalog. Adding a key adds a tick or a row, with no UI change.

## Acceptance criteria

- [ ] A unit test on the row model (a pure function from the catalog to rows) asserts three things:
  - Every `-edit` key is the Edit tick of its page's row, never a row of its own.
  - Every tab key is indented under its page.
  - Rows without an Edit key have one tick.
  - "Refund money" appears under Orders and under Returns with only an Edit tick.
- [ ] The existing roles-tab tests still pass.
- [ ] Preview screenshots of the Roles tab at desktop and phone width, sent to the owner, saying the data is sample data.

## Blocked by

- Slice 01.
