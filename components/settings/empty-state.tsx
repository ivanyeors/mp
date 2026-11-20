import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed px-4 py-8 text-center md:p-14", className)}>
      {Icon ? <Icon className="mx-auto mb-3 size-8 text-muted-foreground/40 md:size-10" aria-hidden /> : null}
      <div className="text-sm font-medium text-muted-foreground">{children}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
