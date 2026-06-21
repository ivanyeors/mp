"use client";

import Link from "next/link";
import { CurrencySelector } from "@/components/shop/currency-selector";
import { CartButton } from "@/components/shop/cart-button";

export function ShopHeader() {
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
          <CartButton />
        </div>
      </div>
    </header>
  );
}
