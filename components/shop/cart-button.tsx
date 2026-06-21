"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { CartPopover } from "@/components/shop/cart-popover";
import { CartTrigger } from "@/components/shop/cart-trigger";

interface CartButtonProps {
  className?: string;
  iconClassName?: string;
  badgeClassName?: string;
}

/** Desktop: popover dropdown. Mobile: navigates to cart page. */
export function CartButton({ className, iconClassName, badgeClassName }: CartButtonProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <CartTrigger
        className={className}
        iconClassName={iconClassName}
        badgeClassName={badgeClassName}
      />
    );
  }

  return (
    <CartPopover
      trigger={
        <CartTrigger
          suppressOpen
          className={className}
          iconClassName={iconClassName}
          badgeClassName={badgeClassName}
        />
      }
    />
  );
}
