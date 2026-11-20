import { stripeMode, type StripeMode } from "./mode";

export type PaymentUi = "hosted" | "elements";

function publishableKeyMode(key: string): StripeMode | null {
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return null;
}

export function onPagePublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!key) return null;
  return publishableKeyMode(key) === stripeMode() ? key : null;
}

export function resolvePaymentUi(requested: PaymentUi | undefined): PaymentUi {
  return requested === "elements" && onPagePublishableKey() ? "elements" : "hosted";
}
