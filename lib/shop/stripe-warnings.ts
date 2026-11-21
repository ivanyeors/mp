import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export type StripeWarning = { product: string; message: string };

export function productName(row: { slug: string; content: unknown }): string {
  const content = (row.content ?? {}) as Record<string, { title?: string } | undefined>;
  return content[DEFAULT_LOCALE]?.title?.trim() || row.slug;
}

export function warningsFor(product: string, problems: string[]): StripeWarning[] {
  return problems.map((message) => ({ product, message }));
}

export function stripeWarningText(w: StripeWarning): string {
  return `${w.product}: ${w.message}. Open ${w.product} in Products and use Sync to Stripe to try again.`;
}

export function stripeWarningToast(title: string, warnings: StripeWarning[]) {
  return [
    title,
    {
      description: warnings.map(stripeWarningText).join("\n\n"),
      duration: Infinity,
      closeButton: true,
      classNames: { description: "whitespace-pre-line" },
    },
  ] as const;
}
