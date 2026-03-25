import { supabaseAdmin } from "@/lib/supabase/server";
import type { Cart, CartItem, ProductVariant, Product } from "@/lib/types/ecommerce";

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
}

export async function getOrCreateCart(token: string | null): Promise<Cart> {
  const admin = supabaseAdmin();

  if (token) {
    const { data } = await admin
      .from("carts")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .single();
    if (data) return data as Cart;
  }

  // Create new cart
  const newToken = generateToken();
  const { data, error } = await admin
    .from("carts")
    .insert({ token: newToken })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create cart: ${error.message}`);
  return data as Cart;
}

export async function getCartWithItems(token: string): Promise<Cart & { items: (CartItem & { variant: ProductVariant; product: Product })[] }> {
  const admin = supabaseAdmin();

  const { data: cart } = await admin
    .from("carts")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!cart) throw new Error("Cart not found or expired");

  const { data: items } = await admin
    .from("cart_items")
    .select("*, product_variants(*, products(*))")
    .eq("cart_id", cart.id);

  const enrichedItems = (items ?? []).map((item: CartItem & { product_variants: ProductVariant & { products: Product } }) => ({
    ...item,
    variant: item.product_variants,
    product: item.product_variants?.products,
  }));

  return { ...cart, items: enrichedItems } as Cart & { items: (CartItem & { variant: ProductVariant; product: Product })[] };
}

export async function addCartItem(cartId: string, variantId: string, quantity: number) {
  const admin = supabaseAdmin();

  // Upsert: if same variant already in cart, increment quantity
  const { data: existing } = await admin
    .from("cart_items")
    .select("*")
    .eq("cart_id", cartId)
    .eq("variant_id", variantId)
    .single();

  if (existing) {
    const newQty = existing.quantity + quantity;
    const { data, error } = await admin
      .from("cart_items")
      .update({ quantity: newQty })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await admin
    .from("cart_items")
    .insert({ cart_id: cartId, variant_id: variantId, quantity })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCartItemQuantity(itemId: string, quantity: number) {
  const admin = supabaseAdmin();
  if (quantity <= 0) {
    await admin.from("cart_items").delete().eq("id", itemId);
    return null;
  }
  const { data, error } = await admin
    .from("cart_items")
    .update({ quantity })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeCartItem(itemId: string) {
  const admin = supabaseAdmin();
  await admin.from("cart_items").delete().eq("id", itemId);
}

export async function clearCart(cartId: string) {
  const admin = supabaseAdmin();
  await admin.from("cart_items").delete().eq("cart_id", cartId);
}

export function calculateCartTotals(items: { quantity: number; variant: { price: number } }[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.variant.price, 0);
  return { subtotal };
}
