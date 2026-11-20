"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/lib/shop/cart-context";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { useIsMobile } from "@/hooks/use-mobile";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CartTriggerProps extends ComponentPropsWithoutRef<"button"> {
  iconClassName?: string;
  badgeClassName?: string;
  suppressOpen?: boolean;
}

export const CartTrigger = forwardRef<HTMLButtonElement, CartTriggerProps>(
  function CartTrigger(
    {
      className,
      iconClassName,
      badgeClassName,
      suppressOpen,
      onClick,
      children,
      ...rest
    },
    ref
  ) {
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const isMobile = useIsMobile();
    const { itemCount, toggleCart, hydrated } = useCart();

    function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
      onClick?.(event);
      if (suppressOpen || event.defaultPrevented) return;

      if (isMobile) {
        router.push(withLocale("/shop/cart", locale));
      } else {
        toggleCart(true);
      }
    }

    if (children) {
      return (
        <button {...rest} ref={ref} type="button" onClick={handleClick} className={className}>
          {children}
        </button>
      );
    }

    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative overflow-visible", className)}
        aria-label={`Shopping cart${hydrated && itemCount > 0 ? `, ${itemCount} items` : ""}`}
        onClick={handleClick}
      >
        <ShoppingBag className={cn("size-5", iconClassName)} />
        <AnimatePresence mode="wait">
          {hydrated && itemCount > 0 && (
            <motion.span
              key={itemCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className={cn(
                "absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground",
                badgeClassName
              )}
            >
              {itemCount > 99 ? "99+" : itemCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }
);
