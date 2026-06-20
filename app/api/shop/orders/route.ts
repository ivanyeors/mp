import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const AddressSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
}).passthrough();

const OrderItemSchema = z.object({
  variant_id: z.string().uuid().optional(),
  sku: z.string(),
  product_title: z.string(),
  variant_title: z.string().optional(),
  image_url: z.string().url().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  total_price: z.number().nonnegative(),
});

const CreateOrderSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  status: z
    .enum([
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional()
    .default("pending"),
  currency: z.string().length(3).optional().default("USD"),
  subtotal: z.number().nonnegative(),
  shipping_amount: z.number().nonnegative().optional().default(0),
  tax_amount: z.number().nonnegative().optional().default(0),
  discount_amount: z.number().nonnegative().optional().default(0),
  total: z.number().nonnegative(),
  shipping_address: AddressSchema,
  billing_address: AddressSchema.optional(),
  shipping_method_id: z.string().uuid().optional(),
  coupon_id: z.string().uuid().optional(),
  coupon_code: z.string().optional(),
  notes: z.string().optional(),
  payment_method: z.string().optional(),
  items: z.array(OrderItemSchema).min(1),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const email = searchParams.get("email");
  const customer_id = searchParams.get("customer_id");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const sort = searchParams.get("sort") ?? "created_at.desc";

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("orders")
    .select("*", { count: "exact" });

  if (status) query = query.eq("status", status);
  if (email) query = query.ilike("email", `%${email}%`);
  if (customer_id) query = query.eq("customer_id", customer_id);
  if (search) {
    query = query.or(`order_number.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const [sortColumn, sortDir] = sort.split(".");
  const ascending = sortDir === "asc";
  query = query.order(sortColumn ?? "created_at", { ascending });

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { items, ...orderFields } = parsed.data;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert(orderFields)
    .select("*")
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const itemRows = items.map((item) => ({ ...item, order_id: order.id }));
  const { error: itemsError } = await admin.from("order_items").insert(itemRows);

  if (itemsError) {
    // Attempt to clean up the orphaned order
    await admin.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Add initial timeline event
  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "order_created",
    message: "Order created manually by admin.",
  });

  const { data: fullOrder } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", order.id)
    .single();

  return NextResponse.json({ ok: true, row: fullOrder ?? order }, { status: 201 });
}
