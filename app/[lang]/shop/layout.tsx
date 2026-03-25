import { CartProvider } from "@/lib/shop/cart-context";
import type { ReactNode } from "react";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-background">
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </CartProvider>
  );
}
