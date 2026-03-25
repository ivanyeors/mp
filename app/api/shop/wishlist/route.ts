import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const WISHLIST_COOKIE = "wishlist_token";
const WISHLIST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const AddWishlistItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional().default(null),
});

const RemoveWishlistItemSchema = z.object({
  product_id: z.string().uuid(),
});

async function getOrCreateWishlist(admin: ReturnType<typeof supabaseAdmin>, token: string | null): Promise<{ id: string; token: string; isNew: boolean }> {
  if (token) {
    const { data } = await admin.from("wishlists").select("id, token").eq("token", token).single();
    if (data) return { id: data.id, token: data.token, isNew: false };
  }

  const newToken = randomUUID();
  const { data, error } = await admin.from("wishlists").insert({ token: newToken }).select("id, token").single();
  if (error || !data) throw new Error("Failed to create wishlist");
  return { id: data.id, token: data.token, isNew: true };
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WISHLIST_COOKIE)?.value ?? null;

  if (!token) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const admin = supabaseAdmin();

  const { data: wishlist } = await admin.from("wishlists").select("id").eq("token", token).single();
  if (!wishlist) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const { data, error } = await admin
    .from("wishlist_items")
    .select("*, products(*, product_variants(*), product_images(*)), product_variants(*)")
    .eq("wishlist_id", wishlist.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = AddWishlistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(WISHLIST_COOKIE)?.value ?? null;

  const admin = supabaseAdmin();

  let wishlist: { id: string; token: string; isNew: boolean };
  try {
    wishlist = await getOrCreateWishlist(admin, existingToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get or create wishlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Upsert: avoid duplicates by checking existing
  const { data: existing } = await admin
    .from("wishlist_items")
    .select("id")
    .eq("wishlist_id", wishlist.id)
    .eq("product_id", parsed.data.product_id)
    .maybeSingle();

  let item = existing;
  if (!existing) {
    const { data: inserted, error: insertError } = await admin
      .from("wishlist_items")
      .insert({
        wishlist_id: wishlist.id,
        product_id: parsed.data.product_id,
        variant_id: parsed.data.variant_id,
      })
      .select("*")
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    item = inserted;
  }

  const res = NextResponse.json({ ok: true, item });

  if (wishlist.isNew) {
    res.cookies.set(WISHLIST_COOKIE, wishlist.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: WISHLIST_COOKIE_MAX_AGE,
    });
  }

  return res;
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RemoveWishlistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(WISHLIST_COOKIE)?.value ?? null;

  if (!token) {
    return NextResponse.json({ error: "No wishlist found" }, { status: 404 });
  }

  const admin = supabaseAdmin();

  const { data: wishlist } = await admin.from("wishlists").select("id").eq("token", token).single();
  if (!wishlist) {
    return NextResponse.json({ error: "Wishlist not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("wishlist_items")
    .delete()
    .eq("wishlist_id", wishlist.id)
    .eq("product_id", parsed.data.product_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
