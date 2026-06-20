"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCart } from "@/lib/shop/cart-context";
import { CurrencySelector } from "@/components/shop/currency-selector";
import { Button } from "@/components/ui/button";

export function ShopHeader() {
  const { itemCount, toggleCart, hydrated } = useCart();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 flex h-14 items-center justify-between">
        <Link
          href="/shop"
          className="text-lg font-semibold tracking-tight hover:opacity-80 transition-opacity"
        >
          Shop
        </Link>

        <div className="flex items-center gap-1">
          <CurrencySelector />
          <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Shopping cart${hydrated && itemCount > 0 ? `, ${itemCount} items` : ""}`}
          onClick={() => toggleCart(true)}
        >
          <ShoppingBag className="size-5" />
          <AnimatePresence mode="wait">
            {hydrated && itemCount > 0 && (
              <motion.span
                key={itemCount}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
              >
                {itemCount > 99 ? "99+" : itemCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
        </div>
      </div>
    </header>
  );
}
