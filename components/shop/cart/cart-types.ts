export type CartVariant = "popover" | "page";

export interface CartMessages {
  title: string;
  empty: string;
  emptyHint: string;
  continueShopping: string;
  proceedToCheckout: string;
  subtotal: string;
  coupon: string;
  applyCoupon: string;
  couponApplied: (code: string) => string;
  remove: string;
  freeShipping: (amount: string) => string;
  freeShippingQualified: string;
  customizationAddon: string;
  closeCart: string;
}
