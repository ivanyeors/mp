import { supabaseAdmin } from "@/lib/supabase/server";
import {
  FITTING_BATCH_COLUMNS,
  toBatchView,
  type FittingBatchRow,
  type FittingBatchView,
} from "@/lib/fitting-import/batches";

const HISTORY_LIMIT = 50;

export async function loadFittingImportHistory(): Promise<FittingBatchView[] | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("fitting_import_batches")
    .select(FITTING_BATCH_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error || !data) return null;
  const rows = data as unknown as FittingBatchRow[];

  const profileIds = [...new Set(rows.flatMap((r) => (r.run_by_profile_id ? [r.run_by_profile_id] : [])))];
  const userIds = [...new Set(rows.flatMap((r) => (r.run_by_user_id ? [r.run_by_user_id] : [])))];
  const [profiles, members] = await Promise.all([
    profileIds.length
      ? admin.from("mp_staff").select("id, name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? admin.from("admin_users").select("auth_user_id, email").in("auth_user_id", userIds)
      : Promise.resolve({ data: [] as { auth_user_id: string; email: string }[] }),
  ]);

  const names = {
    profiles: new Map(((profiles.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])),
    members: new Map(
      ((members.data ?? []) as { auth_user_id: string; email: string }[]).map((m) => [m.auth_user_id, m.email]),
    ),
  };
  return rows.map((r) => toBatchView(r, names));
}
