import type { CartMessages } from "@/components/shop/cart/cart-types";
import type { Messages } from "@/lib/i18n/messages/types";

export function buildCartMessages(cart: Messages["shop"]["cart"]): CartMessages {
  return {
    title: cart.title,
    empty: cart.empty,
    emptyHint: cart.emptyHint,
    continueShopping: cart.continueShopping,
    proceedToCheckout: cart.proceedToCheckout,
    subtotal: cart.subtotal,
    discount: cart.discount,
    coupon: cart.coupon,
    applyCoupon: cart.applyCoupon,
    couponApplied: (code) => cart.couponApplied.replace("{code}", code),
    remove: cart.remove,
    freeShipping: (amount) => cart.freeShippingAway.replace("{amount}", amount),
    freeShippingQualified: cart.freeShippingQualified,
    customizationAddon: cart.customizationAddon,
    closeCart: cart.closeCart,
  };
}
