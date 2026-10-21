import { listCustomerNotes } from "@/lib/crm/notes";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { NOTES_GROUP } from "@/lib/crm/timeline/groups";
import { streamBatch } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

/**
 * Customer notes (CRM 02) on the timeline (`customers`), in full, without the
 * deleted ones. A note moved from the old Notes box has no author, and its date
 * is the Customer's last update before the move, so it reads as the Notes card
 * shows it: "Notes before {date}".
 */
export const notesAdapter: TimelineAdapter = {
  key: "notes",
  group: NOTES_GROUP,
  kinds: ["note.added"],
  permission: "customers",
  async load(customer, before, limit) {
    const notes = await listCustomerNotes(customer.id, { before, limit });
    return streamBatch(notes, "createdAt", limit, (n) => ({
      id: `note.added:${n.id}`,
      at: n.createdAt,
      kind: "note.added",
      ref: { type: "customer_note", id: n.id },
      summary: n.legacy ? `Notes before ${formatAdminDateMY(n.createdAt)}` : `Note by ${n.authorName ?? "Staff"}`,
      detail: n.body,
    }));
  },
};
