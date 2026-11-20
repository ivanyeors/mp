export interface SortableDragEndEvent {
  canceled?: boolean;
  operation?: {
    canceled?: boolean;
    source?: { id?: string | number; index?: number } | null;
    target?: { id?: string | number } | null;
  } | null;
}

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

  const to =
    typeof source.index === "number" && source.index !== from
      ? source.index
      : items.findIndex((item) => idOf(item) === target.id);

  if (to < 0 || to >= items.length || to === from) return null;

  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
