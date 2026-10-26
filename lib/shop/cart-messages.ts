import type { CartMessages } from "@/components/shop/cart/cart-types";
import type { Messages } from "@/lib/i18n/messages/types";

/**
 * The cart's plain-string dictionary — the only cart-message shape allowed to
 * cross the server → client boundary. `CartMessages` carries two formatter
 * functions (`couponApplied`, `freeShipping`), and React refuses to serialise
 * a function into a client component's props, so a server page must hand the
 * client this dictionary and let it call `buildCartMessages` itself.
 */
export type CartDictionary = Messages["shop"]["cart"];

export function buildCartMessages(cart: CartDictionary): CartMessages {
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
    referralApplied: (code) => cart.referralApplied.replace("{code}", code),
    remove: cart.remove,
    freeShipping: (amount) => cart.freeShippingAway.replace("{amount}", amount),
    freeShippingQualified: cart.freeShippingQualified,
    customizationAddon: cart.customizationAddon,
    closeCart: cart.closeCart,
  };
}
