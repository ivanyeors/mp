/**
 * Reorder helper for `@dnd-kit/react` sortable lists.
 *
 * `event.operation.target` is NOT the destination, which is the trap every handler in
 * this repo fell into. `@dnd-kit/dom/sortable` reorders the list optimistically while
 * you drag, and whenever that projection changes the item's slot it calls
 * `actions.setDropTarget(source.id)` — so on drop, `target.id === source.id` for exactly
 * the drags that moved something. Handlers that derived the destination from `target`
 * and bailed on `source.id === target.id` therefore did nothing on every real reorder,
 * and only "worked" on the drags that changed nothing.
 *
 * The destination is `source.index`: the slot dnd-kit has already projected the row
 * into. This mirrors `move()` in `@dnd-kit/helpers`, which is not a dependency here.
 *
 * Only safe when the rendered list and the sortable group are 1:1 — `source.index` is an
 * index within the group, so a provider spanning several independent lists needs a
 * `group` per list before this applies.
 */

/** The shape of `@dnd-kit/react`'s drag-end event that a reorder actually needs. */
export interface SortableDragEndEvent {
  /** Set when the drag was abandoned — Escape mid-drag still fires drag-end. */
  canceled?: boolean;
  operation?: {
    canceled?: boolean;
    source?: { id?: string | number; index?: number } | null;
    target?: { id?: string | number } | null;
  } | null;
}

/**
 * The list in its new order, or `null` when the drag changed nothing and no write is
 * needed. `idOf` maps an item to the id its `useSortable({ id })` was given.
 */
export function sortableMove<T>(
  items: readonly T[],
  event: SortableDragEndEvent,
  idOf: (item: T) => string | number,
): T[] | null {
  const source = event.operation?.source;
  const target = event.operation?.target;
  if (event.canceled || event.operation?.canceled || !source || !target) return null;

  const from = items.findIndex((item) => idOf(item) === source.id);
  if (from === -1) return null;

  // Prefer the projected slot; fall back to the target's index for the case dnd-kit
  // leaves the projection untouched (a drop that never crossed a neighbour).
  const to =
    typeof source.index === "number" && source.index !== from
      ? source.index
      : items.findIndex((item) => idOf(item) === target.id);

  if (to < 0 || to >= items.length || to === from) return null;

  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
