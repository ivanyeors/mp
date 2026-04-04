import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const CreateCustomerSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().min(1).optional(),
  last_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  locale: z.string().optional().default("en-US"),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search");
  const tags = searchParams.get("tags");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const sort = searchParams.get("sort") ?? "newest";

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("customers").select("*", { count: "exact" });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      query = query.overlaps("tags", tagList);
    }
  }

  switch (sort) {
    case "name-asc":
      query = query.order("first_name", { ascending: true }).order("last_name", { ascending: true });
      break;
    case "name-desc":
      query = query.order("first_name", { ascending: false }).order("last_name", { ascending: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.from("customers").insert(parsed.data).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A customer with this email already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}
