"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Page-transition wrapper for the configurators. The cart and currency
 * providers it used to carry now live in the root layout — mounting a second
 * CartProvider here would give the configurator its own cart state, racing the
 * header's over the same `mp_cart` localStorage key.
 */
export function ConfiguratorClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
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
  );
}
