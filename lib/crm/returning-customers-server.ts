import { supabaseAdmin } from "@/lib/supabase/server";
import { returningSummary, type CohortRow, type ReturningSummary } from "@/lib/crm/returning-customers";

export async function getReturningCustomers(now: Date = new Date()): Promise<ReturningSummary | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc("admin_returning_customer_cohorts");
    if (error || !Array.isArray(data)) return null;
    return returningSummary(data as CohortRow[], now);
  } catch {
    return null;
  }
}
