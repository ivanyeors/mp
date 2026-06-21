"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/lib/shop/cart-context";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import { useIsMobile } from "@/hooks/use-mobile";

/** Redirects to cart page when isOpen on mobile (e.g. after addItem). */
export function CartShell() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const basePath = stripLocale(pathname);
  const { isOpen, toggleCart } = useCart();

  useEffect(() => {
    if (!isMobile || !isOpen) return;
    if (basePath === "/shop/cart") {
      toggleCart(false);
      return;
    }
    router.push(withLocale("/shop/cart", locale));
    toggleCart(false);
  }, [isMobile, isOpen, router, locale, toggleCart, basePath]);

  return null;
}
