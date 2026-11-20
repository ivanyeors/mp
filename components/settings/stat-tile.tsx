import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
};

export function StatTile({ label, value, hint, icon: Icon, loading, className }: StatTileProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 sm:p-4", className)}>
      {Icon ? (
        <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums leading-snug">
          {loading ? <span className="text-muted-foreground">…</span> : value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
