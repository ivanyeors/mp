import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  href?: string;
  onClick?: () => void;
  label?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

const rowTargetClassName =
  "flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left outline-none focus-visible:bg-accent";

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
