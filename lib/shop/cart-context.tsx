"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartItemClient } from "@/lib/types/ecommerce";

const STORAGE_KEY = "mp_cart";

/** What the one code field holds (ADR 0033): a discount or a partner's referral code. */
export type CartCodeKind = "discount" | "referral";

interface CartState {
  items: CartItemClient[];
  /** The code, whichever kind it is; kept under its old name for stored carts. */
  couponCode: string | null;
  couponKind: CartCodeKind | null;
  /** The partner a referral code credits, for the field's status line. */
  couponPartnerName: string | null;
  couponDiscount: number;
  couponFreeShipping: boolean;
  couponError: string | null;
  couponValidating: boolean;
  customerEmail: string | null;
  isOpen: boolean;
}

interface CartActions {
  addItem: (item: CartItemClient) => void;
  removeItem: (variantId: string, customizationId?: string) => void;
  updateQuantity: (variantId: string, quantity: number, customizationId?: string) => void;
  applyCoupon: (code: string | null) => Promise<void>;
  /** Checkout checked the code itself; keep its answer so the cart agrees. */
  rememberCode: (
    result: { code: string; kind: CartCodeKind; discount: number; freeShipping: boolean; partnerName?: string } | null,
  ) => void;
  clearCart: () => void;
  toggleCart: (open?: boolean) => void;
}

interface CartContextValue extends CartState, CartActions {
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCartFromStorage(): Pick<CartState, "items" | "couponCode"> {
  if (typeof window === "undefined") return { items: [], couponCode: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], couponCode: null };
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      couponCode: parsed.couponCode ?? null,
    };
  } catch {
    return { items: [], couponCode: null };
  }
}

function saveCartToStorage(state: Pick<CartState, "items" | "couponCode">) {
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

type CodeCheck =
  | { valid: true; kind: CartCodeKind; code: string; discount: number; freeShipping: boolean; partnerName: string | null }
  | { valid: false; error: string };

/** Asks the one code endpoint (ADR 0033) what this code means for this cart. */
async function validateCouponClient(
  code: string,
  items: CartItemClient[],
  subtotal: number,
  email?: string
): Promise<CodeCheck> {
  try {
    const res = await fetch("/api/checkout/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        email: email || undefined,
        context: {
          flow: "shop",
          subtotal,
          line_items: items.map((i) => ({
            product_id: i.productId,
            line_total: (i.price + (i.addonPrice ?? 0)) * i.quantity,
          })),
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { valid: false, error: typeof json.error === "string" ? json.error : "We couldn't check this code" };
    }
    if (json.kind === "discount") {
      return {
        valid: true,
        kind: "discount",
        code: String(json.code ?? code),
        discount: Number(json.discount_amount) || 0,
        freeShipping: json.free_shipping === true,
        partnerName: null,
      };
    }
    if (json.kind === "referral") {
      return {
        valid: true,
        kind: "referral",
        code,
        discount: 0,
        freeShipping: false,
        partnerName: typeof json.partner_name === "string" ? json.partner_name : null,
      };
    }
    return {
      valid: false,
      error: json.kind === "invalid" && json.reason ? String(json.reason) : "Code not recognised",
    };
  } catch {
    return { valid: false, error: "We couldn't check this code" };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>({
    items: [],
    couponCode: null,
    couponKind: null,
    couponPartnerName: null,
    couponDiscount: 0,
    couponFreeShipping: false,
    couponError: null,
    couponValidating: false,
    customerEmail: null,
    isOpen: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadCartFromStorage();
    setState((prev) => ({ ...prev, ...stored }));
    setHydrated(true);
  }, []);

  // Only once there is something in the cart. The provider is mounted app-wide,
  // and customerEmail is read by coupon validation and checkout only — firing
  // this on every page load would be a request per visit for nothing. Keyed on
  // the boolean, not the count, so adding a second item does not refetch.
  const hasItems = state.items.length > 0;
  useEffect(() => {
    if (!hydrated || !hasItems) return;
    fetch("/api/account/addresses")
      .then((res) => res.json())
      .then((data: { signedIn?: boolean; email?: string | null }) => {
        if (data?.signedIn && data.email) {
          setState((prev) => ({ ...prev, customerEmail: data.email!.trim() }));
        }
      })
      .catch(() => {});
  }, [hydrated, hasItems]);

  useEffect(() => {
    if (hydrated) saveCartToStorage(state);
  }, [state, hydrated]);

  // Re-validate stored coupon when cart items change.
  useEffect(() => {
    if (!hydrated || !state.couponCode || state.items.length === 0) return;
    const subtotal = state.items.reduce(
      (sum, item) => sum + (item.price + (item.addonPrice ?? 0)) * item.quantity,
      0
    );
    validateCouponClient(
      state.couponCode,
      state.items,
      subtotal,
      state.customerEmail ?? undefined
    ).then((result) => {
      if (!result.valid) {
        setState((prev) => ({
          ...prev,
          couponCode: null,
          couponKind: null,
          couponPartnerName: null,
          couponDiscount: 0,
          couponFreeShipping: false,
          couponError: result.error,
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        couponKind: result.kind,
        couponPartnerName: result.partnerName,
        couponDiscount: result.discount,
        couponFreeShipping: result.freeShipping,
        couponError: null,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.items, state.customerEmail, hydrated]);

  const addItem = useCallback((item: CartItemClient) => {
    setState((prev) => {
      const itemKey = item.variantId + (item.customizationId ?? "");
      const existing = prev.items.find(
        (i) => i.variantId + (i.customizationId ?? "") === itemKey
      );
      if (existing) {
        return {
          ...prev,
          isOpen: true,
          items: prev.items.map((i) =>
            i.variantId + (i.customizationId ?? "") === itemKey
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
        };
      }
      return { ...prev, isOpen: true, items: [...prev.items, item] };
    });
  }, []);

  const removeItem = useCallback((variantId: string, customizationId?: string) => {
    const key = variantId + (customizationId ?? "");
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.variantId + (i.customizationId ?? "") !== key),
    }));
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number, customizationId?: string) => {
    const key = variantId + (customizationId ?? "");
    setState((prev) => {
      if (quantity <= 0) {
        return { ...prev, items: prev.items.filter((i) => i.variantId + (i.customizationId ?? "") !== key) };
      }
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.variantId + (i.customizationId ?? "") === key ? { ...i, quantity } : i
        ),
      };
    });
  }, []);

  const applyCoupon = useCallback(async (code: string | null) => {
    if (!code) {
      setState((prev) => ({
        ...prev,
        couponCode: null,
        couponKind: null,
        couponPartnerName: null,
        couponDiscount: 0,
        couponFreeShipping: false,
        couponError: null,
        couponValidating: false,
      }));
      return;
    }

    const trimmed = code.toUpperCase().trim();
    let items: CartItemClient[] = [];
    let subtotal = 0;
    let email: string | undefined;

    setState((prev) => {
      items = prev.items;
      subtotal = prev.items.reduce(
        (sum, item) => sum + (item.price + (item.addonPrice ?? 0)) * item.quantity,
        0
      );
      email = prev.customerEmail ?? undefined;
      return { ...prev, couponValidating: true, couponError: null };
    });

    const result = await validateCouponClient(trimmed, items, subtotal, email);
    if (!result.valid) {
      setState((prev) => ({
        ...prev,
        couponValidating: false,
        couponError: result.error,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      couponCode: result.code.toUpperCase(),
      couponKind: result.kind,
      couponPartnerName: result.partnerName,
      couponDiscount: result.discount,
      couponFreeShipping: result.freeShipping,
      couponError: null,
      couponValidating: false,
    }));
  }, []);

  const rememberCode = useCallback<CartActions["rememberCode"]>((result) => {
    setState((prev) => ({
      ...prev,
      couponCode: result ? result.code.toUpperCase() : null,
      couponKind: result?.kind ?? null,
      couponPartnerName: result?.partnerName ?? null,
      couponDiscount: result?.discount ?? 0,
      couponFreeShipping: result?.freeShipping ?? false,
      couponError: null,
      couponValidating: false,
    }));
  }, []);

  const clearCart = useCallback(() => {
    setState((prev) => ({
      ...prev,
      items: [],
      couponCode: null,
      couponKind: null,
      couponPartnerName: null,
      couponDiscount: 0,
      couponFreeShipping: false,
      couponError: null,
      couponValidating: false,
    }));
  }, []);

  const toggleCart = useCallback((open?: boolean) => {
    setState((prev) => ({ ...prev, isOpen: open ?? !prev.isOpen }));
  }, []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, item) => sum + item.quantity, 0),
    [state.items]
  );

  const subtotal = useMemo(
    () => state.items.reduce((sum, item) => sum + (item.price + (item.addonPrice ?? 0)) * item.quantity, 0),
    [state.items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      addItem,
      removeItem,
      updateQuantity,
      applyCoupon,
      rememberCode,
      clearCart,
      toggleCart,
      itemCount,
      subtotal,
      hydrated,
    }),
    [state, addItem, removeItem, updateQuantity, applyCoupon, rememberCode, clearCart, toggleCart, itemCount, subtotal, hydrated]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
