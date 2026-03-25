import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCartWithItems, getOrCreateCart, addCartItem } from "@/lib/ecommerce/cart";

export const runtime = "nodejs";

const CART_COOKIE = "cart_token";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value ?? null;

  if (!token) {
    return NextResponse.json({ ok: true, cart: null, items: [] });
  }

  try {
    const cart = await getCartWithItems(token);
    return NextResponse.json({ ok: true, cart });
  } catch {
    // Token exists but cart not found or expired — return empty state
    return NextResponse.json({ ok: true, cart: null, items: [] });
  }
}

const AddItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = AddItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CART_COOKIE)?.value ?? null;

  let cart;
  try {
    cart = await getOrCreateCart(existingToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get or create cart";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let item;
  try {
    item = await addCartItem(cart.id, parsed.data.variant_id, parsed.data.quantity);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add item to cart";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, cart, item });

  // Set cookie on response if this is a new cart (token differs from the one in the request)
  if (cart.token !== existingToken) {
    res.cookies.set(CART_COOKIE, cart.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: CART_COOKIE_MAX_AGE,
    });
  }

  return res;
}
