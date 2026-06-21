import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";

/**
 * Admin audit logging (#38).
 *
 * `recordAdminAction` is the single entry point invoked from mutating admin
 * paths. It captures the actor, the action, the affected entity, and
 * before/after snapshots. It is intentionally best-effort: audit logging must
 * never break or roll back the underlying admin action, so failures are
 * swallowed.
 */

export interface AdminActionInput {
  /** The staff member performing the action (from `getAdminContext`). */
  actor: Pick<AdminContext, "userId" | "email"> | null;
  /** Dotted action name, e.g. "order.status_change" or "admin_user.invite". */
  action: string;
  /** The kind of entity affected, e.g. "order", "product", "admin_user". */
  entityType: string;
  entityId?: string | null;
  /** Snapshot before the change (null for creates). */
  before?: unknown;
  /** Snapshot after the change (null for deletes). */
  after?: unknown;
}

export async function recordAdminAction(input: AdminActionInput): Promise<void> {
  try {
    const admin = supabaseAdmin();
    await admin.from("admin_audit_log").insert({
      actor_id: input.actor?.userId ?? null,
      actor_email: input.actor?.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
    });
  } catch {
    // Audit logging is best-effort and must not affect the admin action.
  }
}
