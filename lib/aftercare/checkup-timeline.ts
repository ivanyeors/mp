/**
 * Check-up reminders on the Customer timeline (CRM slice 08, through slice 03's
 * read-time merge, ADR 0027 b): one entry per Order and milestone, *Check-up
 * reminder sent (email, WhatsApp)*, at the earlier send. It links to the Order.
 *
 * Pure. The adapter that reads the two ledgers is
 * lib/crm/timeline/sources/checkups.ts.
 */

import type { TimelineEntry } from "@/lib/crm/timeline/types";
import { milestoneOfTemplate } from "./checkup";

export const CHECKUP_TIMELINE_KINDS = ["checkup.sent"] as const;

/** A check-up row of either ledger: `template` is `aftercare.checkup_<n>m`, `entity_id` the Order. */
export type CheckupSendRow = {
  channel: "email" | "whatsapp";
  template: string;
  entity_id: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};

const CHANNEL_LABEL = { email: "email", whatsapp: "WhatsApp" } as const;

/** Instants compare as time, whatever offset format the database returned. */
const ms = (iso: string) => Date.parse(iso);

function milestoneLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "1 year after delivery" : `${months / 12} years after delivery`;
  return `${months} months after delivery`;
}

/** The timeline entries for one Customer's check-ups, newest first. */
export function checkupTimelineEntries(rows: readonly CheckupSendRow[]): TimelineEntry[] {
  const groups = new Map<string, CheckupSendRow[]>();
  for (const row of rows) {
    if (milestoneOfTemplate(row.template) === null) continue;
    const key = `${row.entity_id}|${row.template}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const entries: TimelineEntry[] = [];
  for (const group of groups.values()) {
    const { entity_id: orderId, template } = group[0];
    const months = milestoneOfTemplate(template)!;
    const sent = group.filter((r) => r.status === "sent" && r.sent_at).sort((a, b) => ms(a.sent_at!) - ms(b.sent_at!));
    const channels = (["email", "whatsapp"] as const).filter((c) => sent.some((s) => s.channel === c));
    const base = {
      id: `checkup.sent:${orderId}:${months}`,
      kind: "checkup.sent",
      ref: { type: "order", id: orderId, href: `/settings/orders/${orderId}` },
      detail: milestoneLabel(months),
    };
    entries.push(
      channels.length > 0
        ? { ...base, at: sent[0].sent_at!, summary: `Check-up reminder sent (${channels.map((c) => CHANNEL_LABEL[c]).join(", ")})` }
        : {
            ...base,
            // Claimed, but nothing delivered: a failed email is retried.
            at: [...group].sort((a, b) => ms(a.created_at) - ms(b.created_at))[0].created_at,
            summary: "Check-up reminder not delivered yet",
          },
    );
  }
  return entries.sort((a, b) => ms(b.at) - ms(a.at) || a.id.localeCompare(b.id));
}
