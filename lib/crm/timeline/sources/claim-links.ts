import { supabaseAdmin } from "@/lib/supabase/server";
import { ACCOUNT_GROUP } from "@/lib/crm/timeline/groups";
import { readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

/**
 * Claim links opened (migration slice 06; `customer_claim_links`), under the
 * Account chip beside imported, Claimed and the Claim bonus: *Claim link opened*
 * at a link's first click, one entry per campaign email that carried one.
 *
 * Only the first click is dated by itself; later opens are the count in the
 * line. The send is not here: the email's own ledger (migration slice 08)
 * dates it. The token is never read, only its row.
 */

type LinkRow = { id: number; template: string; first_clicked_at: string | null; click_count: number };

/** `migration_announcement` → "announcement". */
function emailName(template: string): string {
  return template.replace(/^migration_/, "").replace(/_/g, " ");
}

export const claimLinksAdapter: TimelineAdapter = {
  key: "claim_links",
  group: ACCOUNT_GROUP,
  kinds: ["claim_link.opened"],
  permission: "customers",
  async load(customer, before, limit) {
    return readStream<LinkRow>(
      supabaseAdmin()
        .from("customer_claim_links")
        .select("id, template, first_clicked_at, click_count")
        .eq("customer_id", customer.id),
      "first_clicked_at",
      before,
      limit,
      (l) => ({
        id: `claim_link.opened:${l.id}`,
        at: l.first_clicked_at!,
        kind: "claim_link.opened",
        ref: { type: "claim_link", id: String(l.id) },
        summary: `Claim link opened (${emailName(l.template)} email${
          l.click_count > 1 ? `, ${l.click_count} times` : ""
        })`,
      }),
    );
  },
};
