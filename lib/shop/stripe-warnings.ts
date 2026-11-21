import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export type NextStep =
  | { kind: "sync-to-stripe" }
  | { kind: "resync-prices" }
  | { kind: "run-again"; action: string };

export type PriceProblem = { message: string; next?: NextStep };

export type StripeWarning = { product?: string; message: string; next?: string };

export function productName(row: { slug: string; content: unknown }): string {
  const content = (row.content ?? {}) as Record<string, { title?: string } | undefined>;
  return content[DEFAULT_LOCALE]?.title?.trim() || row.slug;
}

export function nextStepText(next: NextStep, product?: string): string {
  switch (next.kind) {
    case "sync-to-stripe":
      return `Open ${product ?? "the product"} in Products and use Sync to Stripe to try again.`;
    case "resync-prices":
      return "Use Resync prices in Products to try again.";
    case "run-again":
      return `Run ${next.action} again.`;
  }
}

export function thrownProblem(err: unknown): PriceProblem {
  const reason = err instanceof Error ? err.message : String(err);
  return { message: `Couldn't update its prices from Costings: ${reason}`, next: { kind: "resync-prices" } };
}

export function warningsFor(product: string | undefined, problems: PriceProblem[]): StripeWarning[] {
  return problems.map((p) => ({
    ...(product ? { product } : {}),
    message: p.message,
    ...(p.next ? { next: nextStepText(p.next, product) } : {}),
  }));
}

export function stripeWarningText(w: StripeWarning): string {
  const head = w.product ? `${w.product}: ${w.message}.` : `${w.message}.`;
  return w.next ? `${head} ${w.next}` : head;
}

export type SavedToast = {
  type: "success" | "warning";
  title: string;
  options?: {
    description?: string;
    duration?: number;
    closeButton?: boolean;
    classNames?: { description?: string };
    action?: { label: string; onClick: () => void };
  };
};

export function savedToasts(
  done: string,
  outcome: {
    unresolvable?: number;
    stripeWarnings?: StripeWarning[];
    successOptions?: SavedToast["options"];
  } = {},
): SavedToast[] {
  const warnings = outcome.stripeWarnings ?? [];
  const unresolvable = outcome.unresolvable ?? 0;
  const toasts: SavedToast[] = [];
  if (warnings.length === 0) toasts.push({ type: "success", title: done, options: outcome.successOptions });
  if (unresolvable > 0) {
    toasts.push({ type: "warning", title: `${unresolvable} variant(s) have no costing source` });
  }
  if (warnings.length > 0) {
    toasts.push({
      type: "warning",
      title: `${done}, but some shop prices need attention`,
      options: {
        description: warnings.map(stripeWarningText).join("\n\n"),
        duration: Infinity,
        closeButton: true,
        classNames: { description: "max-h-[50vh] overflow-y-auto whitespace-pre-line" },
      },
    });
  }
  return toasts;
}

export function costingsSavedToasts(
  payload: { unresolvable_variants?: unknown[]; stripe_warnings?: StripeWarning[] } | null,
): SavedToast[] {
  return savedToasts("Costings saved", {
    unresolvable: payload?.unresolvable_variants?.length ?? 0,
    stripeWarnings: payload?.stripe_warnings,
  });
}
