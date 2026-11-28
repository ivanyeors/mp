import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export function BuyFlowSection({
  id,
  lead,
  rest,
  children,
  className,
}: {
  id: string;
  lead: string;
  rest: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section data-buy-flow-section={id} className={cn("space-y-4", className)}>
      <h3 className="text-xl leading-snug tracking-tight text-pretty md:text-[1.375rem]">
        <span className="font-semibold">{lead}</span>{" "}
        <span className="text-muted-foreground">{rest}</span>
      </h3>
      {children}
    </section>
  );
}

export function BuyFlowChoice({
  title,
  detail,
  trailing,
}: {
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      data-buy-flow-choice=""
      className="flex items-center justify-between gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-4"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-base font-semibold leading-tight">{title}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      {trailing ? (
        <p className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">{trailing}</p>
      ) : null}
    </div>
  );
}

export function BuyFlowInfoRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0">{children}</span>
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background"
      >
        <Plus className="size-4" />
      </span>
    </button>
  );
}

export function BuyFlowNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div role="note" className="flex gap-3 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
      {icon ? <span className="mt-0.5 shrink-0 text-foreground">{icon}</span> : null}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function BuyFlowSummary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-buy-flow-summary="" className={cn("space-y-2.5 rounded-3xl bg-muted/50 p-5", className)}>
      {children}
    </div>
  );
}

export function BuyFlowSummaryRow({
  label,
  value,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "saving" | "total";
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 text-sm",
        tone === "saving" && "text-emerald-700 dark:text-emerald-400",
        tone === "total" && "border-t pt-3 text-base font-semibold",
      )}
    >
      <span className={cn("min-w-0", tone === "default" && "text-muted-foreground")}>{label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
}

export function BuyFlowBarTotal({
  label,
  amount,
  className,
}: {
  label: string;
  amount: string;
  className?: string;
}) {
  return (
    <div data-buy-flow-bar-total="" className={cn("flex min-w-0 flex-col justify-center leading-tight", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{amount}</span>
    </div>
  );
}
