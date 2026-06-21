"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { CartProvider } from "@/lib/shop/cart-context";
import { CurrencyProvider } from "@/lib/shop/currency-context";
import { CartShell } from "@/components/shop/cart-shell";
import type { ReactNode } from "react";

export default function MbolsterConfigLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <CurrencyProvider>
      <CartProvider>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <CartShell />
      </CartProvider>
    </CurrencyProvider>
  );
}
