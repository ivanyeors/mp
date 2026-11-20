import { supabaseAdmin } from "@/lib/supabase/server";
import { lifecycleSummary, type LifecycleCountRow, type LifecycleSummary } from "@/lib/crm/lifecycle-summary";

export async function getLifecycleSummary(): Promise<LifecycleSummary | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc("admin_customer_lifecycle_counts");
    if (error || !Array.isArray(data)) return null;
    return lifecycleSummary(data as LifecycleCountRow[]);
  } catch {
    return null;
  }
}
