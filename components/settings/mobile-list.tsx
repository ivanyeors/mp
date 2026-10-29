import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The phone layout of an Admin Panel list that is a table from `md`. A table on a
 * phone hides its status and action columns off to the right; this list shows one
 * card-like row per record instead. Render it beside the table: the list is
 * `md:hidden`, so wrap the table in `hidden md:block`.
 */
export function MobileList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="mobile-list"
      className={cn("divide-y overflow-hidden rounded-xl border bg-card md:hidden", className)}
      {...props}
    />
  );
}

type MobileListRowProps = {
  /** Where the row goes. The whole row (except `actions`) is the link. */
  href?: string;
  /** For a row that opens something in place (a sheet, a dialog). */
  onClick?: () => void;
  /** Accessible name when the row content is not a good link text on its own. */
  label?: string;
  /** Secondary actions, kept outside the link as their own 44px targets. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

const rowTargetClassName =
  "flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left outline-none focus-visible:bg-accent";

/**
 * One record. The primary content is a single tap target from edge to edge, at
 * least 56px tall, with a chevron, and the row tints while pressed (phones never
 * show `hover:`). A row with neither `href` nor `onClick` is a plain row.
 */
export function MobileListRow({ href, onClick, label, actions, className, children }: MobileListRowProps) {
  const body = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {href || onClick ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  return (
    <li
      className={cn(
        "flex items-stretch transition-colors has-[[data-row-target]:active]:bg-press",
        className,
      )}
    >
      {href ? (
        <Link href={href} data-row-target aria-label={label} className={rowTargetClassName}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" data-row-target aria-label={label} onClick={onClick} className={rowTargetClassName}>
          {body}
        </button>
      ) : (
        <div className={rowTargetClassName}>{body}</div>
      )}
      {actions ? <div className="flex shrink-0 items-center gap-2 pr-2">{actions}</div> : null}
    </li>
  );
}
