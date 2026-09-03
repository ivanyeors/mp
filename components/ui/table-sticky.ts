/**
 * Phone table pattern: the first (label) column stays pinned while the rest of
 * the row scrolls sideways inside `Table`'s overflow container, so numeric
 * inputs keep enough width to show their whole value instead of being crushed
 * to fit the viewport.
 *
 * The pinned edge is a box-shadow, not a border: collapsed table borders do
 * not travel with a sticky cell in Chrome. Desktop (`sm+`) gets the plain
 * table back.
 */
export const stickyFirstColumnHeadClassName =
  "sticky left-0 z-10 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] bg-background shadow-[inset_-1px_0_0_0_var(--border)] sm:static sm:w-2/5 sm:min-w-0 sm:max-w-none sm:shadow-none";

export const stickyFirstColumnCellClassName =
  "sticky left-0 z-10 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] bg-background align-middle shadow-[inset_-1px_0_0_0_var(--border)] sm:static sm:w-auto sm:min-w-0 sm:max-w-none sm:shadow-none";
