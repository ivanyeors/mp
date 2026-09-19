import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A page's top-level action cluster.
 *
 * On mobile the actions become a two-column grid of tall tiles, the same shape
 * as the Admin Panel mobile menu (`SettingsSidebarNav`) — minus its icons, so
 * the label carries the meaning. Five actions used to stack as five full-width
 * 44px rows and push the page's content below the fold; two columns of 56px
 * tiles fit the same set in half the height with a bigger tap target.
 *
 * At `md` and up the wrapper turns back into the inline flex row the desktop
 * layouts already had, so desktop density is unchanged. `md` (not `sm`) is the
 * app's mobile boundary — it matches `useIsMobile`, the sidebar, and the dock.
 */
export function PageActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(pageActionsClassName, className)}>{children}</div>
  );
}

export const pageActionsClassName =
  "grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-2";

/**
 * One tile in the grid. Mobile only: `h-auto` + `min-h-14` lets a two-line
 * label grow the tile instead of clipping, since these read as words alone.
 * Every override is `max-md:` so `cn`'s tailwind-merge resolves it against the
 * Button size tokens (`h-9 max-md:min-h-11`) instead of racing them.
 */
export const pageActionClassName =
  "max-md:h-auto max-md:min-h-14 max-md:w-full max-md:whitespace-normal max-md:px-3 max-md:py-2 max-md:leading-tight";

/** A tile that spans both columns — the primary action, or an odd one out. */
export const pageActionWideClassName = cn(pageActionClassName, "max-md:col-span-2");
