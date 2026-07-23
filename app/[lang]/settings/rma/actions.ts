"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/**
 * Save the staff-only internal note on an RMA request (slice 04). This is the
 * audit-logged proving mutation: it writes `rma_requests.admin_note` and records
 * an admin_audit_log row with before/after. It deliberately does NOT append an
 * `rma_status_events` row — real status transitions (approve/reject/instructions)
 * are slice 05's responsibility; here the timeline is read-only.
 */
export async function saveAdminNote(rmaId: string, note: string) {
  const actor = await assertAdmin("orders");
  const admin = supabaseAdmin();

  const { data: before } = await admin
    .from("rma_requests")
    .select("id, admin_note")
    .eq("id", rmaId)
    .maybeSingle();

  const { data, error } = await admin
    .from("rma_requests")
    .update({ admin_note: note })
    .eq("id", rmaId)
    .select("id, admin_note")
    .single();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "rma.note",
    entityType: "rma_request",
    entityId: rmaId,
    before,
    after: { admin_note: data.admin_note },
  });

  revalidatePath(`/settings/rma/${rmaId}`);
  return { ok: true };
}

/** Form adapter: unwraps the textarea value and delegates to {@link saveAdminNote}. */
export async function saveAdminNoteForm(rmaId: string, formData: FormData) {
  await saveAdminNote(rmaId, String(formData.get("note") ?? ""));
}
