import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { canDeleteNote } from "@/lib/crm/note-rules";
import { noteProfileFor } from "@/lib/crm/notes";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/shop/customers/[id]/notes/[noteId] — soft-deletes a note. Allowed
 * to the note's author (by login) or an Owner or Admin. The audit entry names
 * the note, never its text.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  // customers-edit once CRM 10 lands.
  const denied = await requireAdmin("customers");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, noteId } = await params;
  if (!UUID.test(id) || !UUID.test(noteId)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: note, error } = await admin
    .from("customer_notes")
    .select("id, author_user_id")
    .eq("id", noteId)
    .eq("customer_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  if (!canDeleteNote(ctx, { authorUserId: (note.author_user_id as string | null) ?? null })) {
    return NextResponse.json(
      { error: "Only the note's author, an Owner or an Admin can delete it." },
      { status: 403 },
    );
  }

  const { data: deleted, error: deleteError } = await admin
    .from("customer_notes")
    .update({ deleted_at: new Date().toISOString(), deleted_by_profile_id: await noteProfileFor(ctx.memberId) })
    .eq("id", noteId)
    .is("deleted_at", null)
    .select("id");
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  if (!deleted?.length) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  await recordAdminAction({
    actor: ctx,
    action: "customer_note.delete",
    entityType: "customer_note",
    entityId: noteId,
    before: { customer_id: id },
  });

  return NextResponse.json({ ok: true });
}
