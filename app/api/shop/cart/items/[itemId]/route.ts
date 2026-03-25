import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCartItemQuantity, removeCartItem } from "@/lib/ecommerce/cart";

export const runtime = "nodejs";

const UpdateItemSchema = z.object({
  quantity: z.number().int().min(1),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await updateCartItemQuantity(itemId, parsed.data.quantity);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update cart item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;

  try {
    await removeCartItem(itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove cart item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
