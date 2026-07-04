"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/shop/cart-context";
import { buildCartMessages } from "@/lib/shop/cart-messages";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { getMessages } from "@/lib/i18n/messages";
import { CartContent } from "@/components/shop/cart/cart-content";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CartPopoverProps {
  trigger: ReactNode;
}

export function CartPopover({ trigger }: CartPopoverProps) {
  const pathname = usePathname() ?? "/";
  const locale = (getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE) as Locale;
  const messages = buildCartMessages(getMessages(locale).shop.cart);

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
            className="shrink-0 -mr-1 size-8"
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
      </PopoverContent>
    </Popover>
  );
}
