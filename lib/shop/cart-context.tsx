"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartItemClient } from "@/lib/types/ecommerce";

const STORAGE_KEY = "mp_cart";

interface CartState {
  items: CartItemClient[];
  couponCode: string | null;
  isOpen: boolean;
}

interface CartActions {
  addItem: (item: CartItemClient) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  applyCoupon: (code: string | null) => void;
  clearCart: () => void;
  toggleCart: (open?: boolean) => void;
}

interface CartContextValue extends CartState, CartActions {
  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCartFromStorage(): CartState {
  if (typeof window === "undefined") return { items: [], couponCode: null, isOpen: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], couponCode: null, isOpen: false };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      couponCode: parsed.couponCode ?? null,
      isOpen: false,
    };
  } catch {
    return { items: [], couponCode: null, isOpen: false };
  }
}

function saveCartToStorage(state: CartState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items: state.items, couponCode: state.couponCode })
    );
  } catch {
    // Ignore storage errors
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({ items: [], couponCode: null, isOpen: false });
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setState(loadCartFromStorage());
    setHydrated(true);
  }, []);

  // Persist to localStorage on change (after hydration)
  useEffect(() => {
    if (hydrated) saveCartToStorage(state);
  }, [state, hydrated]);

  const addItem = useCallback((item: CartItemClient) => {
    setState((prev) => {
      const existing = prev.items.find((i) => i.variantId === item.variantId);
      if (existing) {
        return {
          ...prev,
          isOpen: true,
          items: prev.items.map((i) =>
            i.variantId === item.variantId
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
        };
      }
      return { ...prev, isOpen: true, items: [...prev.items, item] };
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.variantId !== variantId),
    }));
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setState((prev) => {
      if (quantity <= 0) {
        return { ...prev, items: prev.items.filter((i) => i.variantId !== variantId) };
      }
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.variantId === variantId ? { ...i, quantity } : i
        ),
      };
    });
  }, []);

  const applyCoupon = useCallback((code: string | null) => {
    setState((prev) => ({ ...prev, couponCode: code }));
  }, []);

  const clearCart = useCallback(() => {
    setState((prev) => ({ ...prev, items: [], couponCode: null }));
  }, []);

  const toggleCart = useCallback((open?: boolean) => {
    setState((prev) => ({ ...prev, isOpen: open ?? !prev.isOpen }));
  }, []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, item) => sum + item.quantity, 0),
    [state.items]
  );

  const subtotal = useMemo(
    () => state.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [state.items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      addItem,
      removeItem,
      updateQuantity,
      applyCoupon,
      clearCart,
      toggleCart,
      itemCount,
      subtotal,
    }),
    [state, addItem, removeItem, updateQuantity, applyCoupon, clearCart, toggleCart, itemCount, subtotal]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
