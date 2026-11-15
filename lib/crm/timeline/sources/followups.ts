import { listFollowUpsByTime } from "@/lib/crm/followups";
import { formatDueOn } from "@/lib/crm/followup-rules";
import { FOLLOW_UPS_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, streamBatch } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineRef } from "@/lib/crm/timeline/types";

/**
 * Follow-ups (CRM 06) on the Customer timeline (`customers`, like the
 * Follow-ups route): when each was added (`created_at`) and when it was done
 * (`done_at`), one stream per column. The title is shown in full. A follow-up has no page of its own, so no link; a deleted one
 * leaves no entry.
 */

const refOf = (id: string): TimelineRef => ({ type: "customer_followup", id });

export const followUpsAdapter: TimelineAdapter = {
  key: "followups",
  group: FOLLOW_UPS_GROUP,
  kinds: ["follow_up.added", "follow_up.done"],
  permission: "customers",
  async load(customer, before, limit) {
    const [added, done] = await Promise.all([
      listFollowUpsByTime(customer.id, "created_at", before, limit),
      listFollowUpsByTime(customer.id, "done_at", before, limit),
    ]);
    return joinBatches([
      streamBatch(added, "createdAt", limit, (f) => ({
        id: `follow_up.added:${f.id}`,
        at: f.createdAt,
        kind: "follow_up.added",
        ref: refOf(f.id),
        summary:
          `Follow-up for ${f.assignee.name}, due ${formatDueOn(f.dueOn)}` +
          (f.createdBy ? `, added by ${f.createdBy.name}` : ""),
        status: f.doneAt ? "done" : "open",
        detail: f.title,
      })),
      streamBatch(done, "doneAt", limit, (f) =>
        f.doneAt
          ? {
              id: `follow_up.done:${f.id}`,
              at: f.doneAt,
              kind: "follow_up.done",
              ref: refOf(f.id),
              summary: `Follow-up done by ${f.doneBy?.name ?? "Staff"}`,
              detail: f.title,
            }
          : null,
      ),
    ]);
  },
};
