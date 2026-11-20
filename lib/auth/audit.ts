import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { getWorkingAs } from "@/lib/staff/working-as";

export interface AdminActionInput {
  actor: (Pick<AdminContext, "userId" | "email"> & { memberId?: string }) | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function recordAdminAction(input: AdminActionInput): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const workingAs = input.actor?.memberId ? await getWorkingAs(input.actor.memberId) : null;
    await admin.from("admin_audit_log").insert({
      ...(workingAs ? { actor_profile_id: workingAs.id } : {}),
      actor_id: input.actor?.userId ?? null,
      actor_email: input.actor?.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
    });
  } catch {}
}
