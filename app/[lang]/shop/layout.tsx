import { CartProvider } from "@/lib/shop/cart-context";
import { CurrencyProvider } from "@/lib/shop/currency-context";
import { CartShell } from "@/components/shop/cart-shell";
import { ShopHeader } from "@/components/shop/shop-header";
import type { ReactNode } from "react";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CurrencyProvider>
      <CartProvider>
        <div className="min-h-screen bg-background">
          <ShopHeader />
          <main className="max-w-7xl mx-auto px-4 py-8">
            {children}
          </main>
        </div>
        <CartShell />
      </CartProvider>
    </CurrencyProvider>
  );
}
