export const CHECKOUT_CODE_MAX_LENGTH = 64;

export type CheckoutCodeContext =
  | {
      flow: "shop";
      subtotal: number;
      line_items: Array<{ product_id: string; line_total: number }>;
    }
  | {
      flow: "customisation";
      build:
        | { product_type: "pillow"; size: string; tier: string }
        | { product_type: "bolster"; length: string };
      goods: number;
    }
  | { flow: "none" };

export type CheckoutCodeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "referral"; code: string; partnerName: string; discount: number }
  | { state: "discount"; code: string; discount: number | null; freeShipping: boolean }
  | { state: "invalid"; code: string; reason: string }
  | { state: "unknown"; code: string }
  | { state: "error"; message: string };

export function checkoutCodeDiscount(status: CheckoutCodeStatus): number {
  if (status.state === "discount") return status.discount ?? 0;
  return status.state === "referral" ? status.discount : 0;
}

export function checkoutCodeDiscountLabel(status: CheckoutCodeStatus): string | null {
  if (status.state === "discount") return status.code;
  return status.state === "referral" && status.discount > 0 ? status.code : null;
}

export function checkoutCodeFreeShipping(status: CheckoutCodeStatus): boolean {
  return status.state === "discount" && status.freeShipping;
}

export function checkoutCodeToSend(code: string, status: CheckoutCodeStatus): string | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return status.state === "invalid" || status.state === "unknown" ? undefined : trimmed;
}
