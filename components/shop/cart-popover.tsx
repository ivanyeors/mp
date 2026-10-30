"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/shop/cart-context";
import { buildCartMessages } from "@/lib/shop/cart-messages";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useMessages } from "@/lib/i18n/messages/client";
import { CartContent } from "@/components/shop/cart/cart-content";
import { Button } from "@/components/ui/button";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CartPopoverProps {
  trigger: ReactNode;
}

export function CartPopover({ trigger }: CartPopoverProps) {
  const pathname = usePathname() ?? "/";
  const locale = (getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE) as Locale;
  const m = useMessages(locale);
  const messages = buildCartMessages(m.shop.cart);

  const {
    items,
    isOpen,
    toggleCart,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
    applyCoupon,
    couponCode,
    couponKind,
    couponPartnerName,
    couponError,
    couponDiscount,
    couponFreeShipping,
    couponValidating,
  } = useCart();

  const shopHref = withLocale("/shop", locale);
  const checkoutHref = withLocale("/shop/checkout", locale);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => toggleCart(open)}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        role="dialog"
        aria-label={messages.title}
        // App UI, not marketing copy: without this the public-route typography
        // forces the "Your Cart" heading to 28px and each line's variant to 18px.
        data-typography-scope="app"
        className="w-[min(100vw-2rem,420px)] rounded-xl border p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">
            {messages.title}
            {itemCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs w-5 h-5 font-medium">
                {itemCount}
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={messages.closeCart}
            onClick={() => toggleCart(false)}
            className="hidden shrink-0 -mr-1 size-8 md:inline-flex"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-[200px] flex max-h-[min(70vh,520px)] flex-col overflow-hidden">
          <CartContent
            variant="popover"
            messages={messages}
            locale={locale}
            subtotal={subtotal}
            couponDiscount={couponDiscount}
            couponFreeShipping={couponFreeShipping}
            items={items}
            couponCode={couponCode}
            couponKind={couponKind}
            couponPartnerName={couponPartnerName}
            couponError={couponError}
            couponValidating={couponValidating}
            applyCoupon={applyCoupon}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            onClose={() => toggleCart(false)}
            shopHref={shopHref}
            checkoutHref={checkoutHref}
          />
        </div>

        <div className="flex justify-end border-t px-3 py-2 md:hidden">
          <OverlayDismissButton
            label={messages.closeCart}
            variant="inline"
            onClick={() => toggleCart(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
