import { supabaseAdmin } from "@/lib/supabase/server";
import { lifecycleSummary, type LifecycleCountRow, type LifecycleSummary } from "@/lib/crm/lifecycle-summary";

/**
 * The Customer lifecycle chart's counts (20261031140000), with the service
 * role; the caller has checked `customers`. Null when the read failed: the
 * chart is then left out and the Customers list still renders.
 */
export async function getLifecycleSummary(): Promise<LifecycleSummary | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc("admin_customer_lifecycle_counts");
    if (error || !Array.isArray(data)) return null;
    return lifecycleSummary(data as LifecycleCountRow[]);
  } catch {
    return null;
  }
}
