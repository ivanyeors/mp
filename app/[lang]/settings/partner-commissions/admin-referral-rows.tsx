import { supabaseAdmin } from "@/lib/supabase/server";
import { loadAdminReferralRows } from "@/lib/commissions/referral-rows";
import { ReferralRowsTable, releaseLabel, statusText } from "@/components/partner/referral-rows";
import { InfoTip } from "@/components/ui/info-tip";

const money = (n: number) => `$${n.toFixed(2)}`;

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
      {rows.length > 0 ? (
        // Phones: the six-column table pushes Commission, Status and Release off-screen.
        <ul className="divide-y rounded-xl border text-sm md:hidden">
          {rows.map((r) => {
            const isVoid = r.status === "void";
            return (
              <li key={r.orderId} className={`space-y-1 px-3 py-3 ${isVoid ? "text-muted-foreground" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 break-words ${isVoid ? "line-through" : "font-medium"}`}>
                    {r.customerName ?? "—"}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {isVoid ? (
                      <span className="line-through">{money(r.voidedAmount)}</span>
                    ) : (
                      <>
                        <span className="font-medium">{money(r.amount)}</span>
                        {r.voidedAmount > 0 ? (
                          <span className="ml-1 text-xs text-muted-foreground line-through">
                            {money(r.voidedAmount)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
                <p className="break-words text-xs text-muted-foreground">{r.customerEmail ?? "—"}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {r.productLabel || "—"} · via {r.partnerName ?? "—"}
                </p>
                <p className="text-xs">
                  <span className="font-medium">{statusText[r.status]}</span>
                  <span className="text-muted-foreground"> · {releaseLabel(r)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={rows.length > 0 ? "hidden md:block" : undefined}>
        <ReferralRowsTable rows={rows} adminView emptyLabel="No attributed orders yet." />
      </div>
    </section>
  );
}
