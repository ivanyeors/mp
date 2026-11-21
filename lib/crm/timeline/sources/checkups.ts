import { supabaseAdmin } from "@/lib/supabase/server";
import { CHECKUP_TEMPLATE_LIKE } from "@/lib/aftercare/checkup";
import { CHECKUP_TIMELINE_KINDS, checkupTimelineEntries, type CheckupSendRow } from "@/lib/aftercare/checkup-timeline";
import { AFTERCARE_GROUP } from "@/lib/crm/timeline/groups";
import { cappedBatch } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

type Row = Omit<CheckupSendRow, "channel">;

export const checkupsAdapter: TimelineAdapter = {
  key: "checkups",
  group: AFTERCARE_GROUP,
  kinds: CHECKUP_TIMELINE_KINDS,
  permission: "customers",
  async load(customer, before) {
    const admin = supabaseAdmin();
    const ledger = (table: "customer_emails" | "customer_whatsapp") =>
      admin
        .from(table)
        .select("template, entity_id, status, sent_at, created_at")
        .eq("customer_id", customer.id)
        .like("template", CHECKUP_TEMPLATE_LIKE);
    const [emails, whatsapp] = await Promise.all([ledger("customer_emails"), ledger("customer_whatsapp")]);
    const failed = emails.error ?? whatsapp.error;
    if (failed) throw new Error(failed.message);

    const entries = checkupTimelineEntries([
      ...((emails.data ?? []) as Row[]).map((r) => ({ ...r, channel: "email" as const })),
      ...((whatsapp.data ?? []) as Row[]).map((r) => ({ ...r, channel: "whatsapp" as const })),
    ]);
    return cappedBatch(entries, before, null);
  },
};
