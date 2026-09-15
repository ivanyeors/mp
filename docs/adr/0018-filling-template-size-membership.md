# Filling Templates are scoped by size membership, not one size key

A **Filling Template** serves a SET of sizes (lengths for **Mbolster**), persisted in
`bom_template_keys` — one row per (template, size). That table is the single authority for
"does this recipe apply here"; every list, assign, assist and default-template reader narrows
through it. `bom_templates.key` stays as the **primary** key and is kept in step with the
canonically-first member by the one writer that changes membership, so it is always a real
member: a partial answer, never a divergent one.

Nothing in a filling recipe is size-specific. The nine **cells**, the **Derived pack list**,
the **Insert order** and the canonical fingerprint are identical whatever the pillow measures —
only the operator's judgement about which filling **Items** suit a size is. Scoping a recipe to
exactly one size therefore forced the same mix to be re-authored per size, and the copies drifted.

## Considered options

- **Nullable `key` meaning "every size"** — rejected. Overlap between sizes is partial and
  operator-judged (an XL mix is rarely an XS mix); "all or one" cannot express it.
- **`keys text[]` on `bom_templates`** — rejected. No way to express per-size name uniqueness
  as an index, and it puts membership behind array operators that every reader must remember.
- **Making `bom_templates.key` vestigial for `role = 'filling'`** — rejected. A column that
  still looks authoritative but is not is exactly the second source of truth CONTEXT.md warns
  about; keeping it pointed at a real member costs one update in the membership writer.
- **Copy-to-other-sizes (duplicate rows)** — rejected. It is what operators already do by hand;
  the copies are what drift.

## Consequences

- A save through a shared template rewrites the recipe for every size it serves. The editor
  says so before the save, and a **Fork** (`POST .../templates/[id]/fork`) copies the recipe to
  a template scoped to one size and drops that size from the original — so a size can always
  stop tracking the shared one. Without the fork, sharing would be a one-way door.
- Deleting is not scoped to the size on screen: it removes the recipe everywhere. A shared
  template asks for confirmation naming the other sizes; dropping one size is a membership
  edit, not a delete.
- Past **Results** are unaffected. A **Filling configuration** is a snapshot, and order build
  snapshots keep `filling_template_name`, so neither sharing, editing, renaming nor deleting
  rewrites a build that already happened.
- A rescope clears this template as the **Default Filling Template** of any product
  card whose size it stops serving, in the same write. A default left pointing outside
  membership is invisible rather than wrong-looking: the assign hint silently stops
  appearing, the Configure picker shows "No default configured" over the old preview,
  and the next unrelated BOM save on that card fails validation.
- `setTemplateKeys` adds membership rows before pruning, never the reverse. The two
  round trips share no transaction, and a failure after a wholesale delete would leave
  a template serving no size — invisible everywhere, with nothing to rebuild it from.
  The worst case is now a size that should have been dropped and was not, which an
  operator can see.
- Name uniqueness within a size is enforced in the application across every size a write would
  reach, because the DB unique index covers the primary key only. Two shares racing into the
  same size can still both land; the cost is a duplicate name in one list, which an operator
  renames — not corrupt data.
- **Warehouse templates** are untouched: they are scoped by size AND tier and are never shared.
