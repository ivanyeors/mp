import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const ApiConfigSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  base_url: z.string().trim().url().max(500),
  api_key: z.string().max(500).optional().default(""),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  active: z.boolean().optional().default(true),
});

const UpdateSchema = ApiConfigSchema.partial().extend({
  id: z.string().uuid(),
});

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

/* ------------------------------------------------------------------ */
/* GET - list all api_configs                                          */
/* ------------------------------------------------------------------ */
export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("api_configs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ------------------------------------------------------------------ */
/* POST - create a new api_config                                      */
/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json();
  const parsed = ApiConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("api_configs")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/* ------------------------------------------------------------------ */
/* PATCH - update an existing api_config                               */
/* ------------------------------------------------------------------ */
export async function PATCH(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("api_configs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ------------------------------------------------------------------ */
/* DELETE - remove an api_config                                       */
/* ------------------------------------------------------------------ */
export async function DELETE(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json();
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("api_configs")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
