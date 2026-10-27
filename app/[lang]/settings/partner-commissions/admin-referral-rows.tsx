import { supabaseAdmin } from "@/lib/supabase/server";
import { loadAdminReferralRows } from "@/lib/commissions/referral-rows";
import { ReferralRowsTable } from "@/components/partner/referral-rows";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * Admin view of every partner's per-referral rows (#80, AC5) — the SAME rows the
 * partner hub shows, but UNMASKED (adminView) and with a Partner column. Staff
 * only: the parent page already gates with requireAdminPage("partner-commissions"); this
 * is a read-only server component, so there is no route/action to re-assert.
 */
export async function AdminReferralRows() {
  const rows = await loadAdminReferralRows(supabaseAdmin());
  return (
    <section className="mt-12 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Referral commissions</h2>
        <InfoTip label="About referral commissions">
          One row for every attributed order, with full customer details. The Partner Hub
          masks link and code referrals. Voided commission is struck through.
        </InfoTip>
      </div>
      <ReferralRowsTable rows={rows} adminView emptyLabel="No attributed orders yet." />
    </section>
  );
}
