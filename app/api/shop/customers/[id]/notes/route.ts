import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { NoteInputSchema } from "@/lib/crm/note-rules";
import { createCustomerNote, listCustomerNotes } from "@/lib/crm/notes";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  try {
    return NextResponse.json({ ok: true, rows: await listCustomerNotes(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load notes" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const parsed = NoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid note" }, { status: 400 });
  }

  const { data: customer } = await supabaseAdmin().from("customers").select("id").eq("id", id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  let note;
  try {
    note = await createCustomerNote(id, parsed.data.body, ctx);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the note" }, { status: 500 });
  }

  await recordAdminAction({
    actor: ctx,
    action: "customer_note.create",
    entityType: "customer_note",
    entityId: note.id,
    after: { customer_id: id },
  });

  return NextResponse.json({ ok: true, row: note }, { status: 201 });
}
