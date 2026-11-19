"use client";

import { Button } from "@/components/ui/button";

/**
 * One block of a Paired build's review (step 4): what was chosen, what it
 * costs, and the way back to change it. The summary is the last thing the
 * shopper sees before paying, so every part of the order has one.
 */
export function ReviewCard({
  title,
  detail,
  lines,
  amount,
  actions = [],
}: {
  title: string;
  detail?: string | null;
  lines: string[];
  amount?: string | null;
  actions?: Array<{ label: string; onClick: () => void }>;
}) {
  return (
    <section className="space-y-1.5 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {detail ? <p className="break-words text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        {amount ? <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums">{amount}</span> : null}
      </div>
      {lines.length > 0 ? (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {lines.map((line, i) => (
            <li key={i} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-x-4">
          {actions.map((a) => (
            <Button key={a.label} variant="link" size="sm" className="h-auto p-0" onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * What comes with the part of the order above it: a warranty, a re-adjustment,
 * the points it earns. Sits between the review's cards, quieter than they are,
 * since it is nothing to check or change.
 */
export function ReviewNote({
  icon,
  title,
  lines,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  footer?: React.ReactNode;
}) {
  return (
    <aside className="flex gap-2.5 rounded-lg bg-muted/50 p-3" data-typography-scope="app">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {lines.map((line, i) => (
            <li key={i} className="break-words">
              {line}
            </li>
          ))}
        </ul>
        {footer ? <div className="text-sm">{footer}</div> : null}
      </div>
    </aside>
  );
}
