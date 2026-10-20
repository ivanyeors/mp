# A Template output may hold one template per size, and a Combine may OR its branches

A **Rule graph** chooses a **Filling Template** without branching on size first: a size-keyed
**Template output** holds one template per size, and the size the graph resolved picks the slot.
A **Combine node** may fire on *any* of its branches instead of all of them. Both are additive —
existing graphs evaluate exactly as before.

## Context

The Premium graph published on 2026-10-17 chose among 34 templates with 250 Combines and 1,240
edges. Three nodes each fanned out 240 edges across a canvas 28,000 px tall — all of it drawn at
once, on a phone too. The decision itself is a table of 60 values (size × neck length × head-to-back ×
neck stack), with one rule on top: stomach sleepers take the neck stack one band lower.

Two engine rules turned that table into 240 cells:

- **A Template output named one size,** and publish required a Size output on its path. Size was
  threaded into every cell through ten size × neck-length gates, multiplying everything by five —
  though a **Filling Template** has served a set of sizes since ADR 0018.
- **A Combine was AND-only.** Disjunction worked only where parallel branches meet a terminal, so an
  OR upstream of an AND — "side, back or mixed", i.e. not stomach — had to be multiplied out into a
  cell per position.

## Decision

- **Size-keyed Template output** (`template-by-size`): `templates` maps a size (or bolster length) to
  a Filling Template id. It resolves after the graph has run, against the size it resolved. With no
  slot for that size — or no size at all — it has **not fired**, so it can never keep the
  **Fallback** from answering. Publish requires its slots to name the flow's sizes, at least one
  slot, and a Size output somewhere in the graph. It takes ordinary signal wires; the single-size
  Template output stays as it was.
- **Any Combine** (`mode: "any"`): fires on the first branch that does. `mode` absent means "all",
  so every stored graph keeps its meaning.
- **The Premium graph is rebuilt** by `lib/rules-engine/streamline-premium.ts` and saved as the draft
  by `scripts/streamline-premium-rule-graph.ts` — 12 size-keyed outputs, 20 Combines and one "Not
  stomach" OR (59 nodes, 119 edges). Template ids are read back by evaluating the published graph,
  the rebuild refuses a graph whose sleep position does more than shift the neck stack, and the
  script refuses to save unless it answers every band boundary exactly as the published version.

## Considered options

- **Rebuild with the old node types** — a second neck-to-back Range, no neck length for L and XL,
  sleep position only where it changes the answer: 102 Combines and 497 edges, still a fan-out of 96.
  It halves the graph and leaves both causes in place.
- **Match edges carrying several values** (`side|back|mixed`) instead of an OR Combine — the same
  graph, but every Match handle and the canvas's one-edge-per-value drawing would need a second
  meaning. A Combine mode is one dropdown.
- **A decision-table node** — one node and a spreadsheet. ADR 0010 rejected tables in favour of the
  graph, and the size-keyed outputs already read as the table's rows.

## Consequences

- Deploy before migrating. An older workbench cannot draw these nodes, and an older server refuses to
  publish them (its validator finds Combines that reach no terminal it knows), so a draft written early
  can only sit unpublished.
- The canvas no longer forbids authoring the logic: a size-keyed output accepts Combine wires, which
  the size-only port of the single-size Template output never did — the 250-Combine graph could not
  have been drawn by hand.
- Size-keyed outputs carry a name ("head low · short neck · neck stack mid") that describes the whole
  decision, which the shopper-facing why line has lacked since answers stopped surviving a Combine.
- A recipe's **Size membership** is not checked at publish: the validator is pure, as before.
