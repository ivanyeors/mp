import { CartProvider } from "@/lib/shop/cart-context";
import type { ReactNode } from "react";

export default function MpConfigLayout({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
