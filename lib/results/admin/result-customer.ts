import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LIFECYCLE_DETAILS,
  LIFECYCLE_STAGES,
  type LifecycleDetail,
  type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { marketingEmailState } from "@/lib/marketing-consent/state";
import { customerDisplayName, type ResultCustomerSummary } from "@/lib/results/result-customer";

const COLUMNS = "id, email, first_name, last_name, phone, purchases, lifecycle_stage, lifecycle_detail, marketing_email";

const isStage = (v: unknown): v is LifecycleStage => (LIFECYCLE_STAGES as readonly unknown[]).includes(v);
const isDetail = (v: unknown): v is LifecycleDetail => (LIFECYCLE_DETAILS as readonly unknown[]).includes(v);

type OverviewRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  purchases: number | null;
  lifecycle_stage: string | null;
  lifecycle_detail: string | null;
  marketing_email: string | null;
};

/**
 * The Customer a Result belongs to, for the Result page's Customer panel (ADR
 * 0051 d), read from the Customer overview so the stage is the one the
 * Customers list shows. Null when it cannot be read: the panel is a
 * convenience, never a reason to fail the page.
 */
export async function loadResultCustomerSummary(
  admin: SupabaseClient,
  customerId: string,
): Promise<ResultCustomerSummary | null> {
  const { data, error } = await admin.from("admin_customer_overview").select(COLUMNS).eq("id", customerId).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as OverviewRow;
  return {
    id: row.id,
    name: customerDisplayName(row),
    email: row.email,
    phone: row.phone?.trim() || null,
    stage: isStage(row.lifecycle_stage) ? row.lifecycle_stage : null,
    detail: isDetail(row.lifecycle_detail) ? row.lifecycle_detail : null,
    purchases: Number(row.purchases ?? 0),
    marketingEmail: row.marketing_email == null ? null : marketingEmailState(row.marketing_email),
  };
}
