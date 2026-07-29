import { maskEmail, maskName } from "@/lib/referrals/masking";
import type { ReferralRow } from "@/lib/commissions/referral-rows";

/**
 * Shared per-referral rows table (#80). Server component — masking happens here,
 * so a masked identity never reaches the client. One row per attributed order.
 *  - Partner hub (default): assist rows show full details; link/code rows masked.
 *  - Admin Panel (`adminView`): everything unmasked + a Partner column (AC5).
 * Voided commission is struck, never dropped (AC6).
 */

const money = (n: number) => `$${n.toFixed(2)}`;
const dateFmt = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" });

function releaseLabel(row: ReferralRow): string {
  switch (row.status) {
    case "released":
      return "Available now";
    case "paid":
      return "Paid out";
    case "void":
      return "Voided";
    default:
      // held — never undated (AC2): exact date when known, else the rule.
      return row.releaseAt
        ? `Releases ${dateFmt.format(new Date(row.releaseAt))} — return window`
        : "Releases 30 days after delivery";
  }
}

const statusText: Record<ReferralRow["status"], string> = {
  held: "Held",
  released: "Released",
  paid: "Paid",
  void: "Voided",
};

export function ReferralRowsTable({
  rows,
  adminView = false,
  emptyLabel = "No referrals yet.",
}: {
  rows: ReferralRow[];
  adminView?: boolean;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground">
          <tr>
            {adminView ? <th className="py-1 pr-4 font-medium">Partner</th> : null}
            <th className="py-1 pr-4 font-medium">Customer</th>
            <th className="py-1 pr-4 font-medium">Product</th>
            <th className="py-1 pr-4 font-medium">Commission</th>
            <th className="py-1 pr-4 font-medium">Status</th>
            <th className="py-1 pr-4 font-medium">Release</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const masked = !adminView && r.attributionSource !== "assist";
            const name = masked ? maskName(r.customerName) : r.customerName ?? "—";
            const email = masked ? maskEmail(r.customerEmail) : r.customerEmail ?? "—";
            const isVoid = r.status === "void";
            return (
              <tr key={r.orderId} className={isVoid ? "text-muted-foreground" : undefined}>
                {adminView ? (
                  <td className="py-1.5 pr-4">{r.partnerName ?? "—"}</td>
                ) : null}
                <td className="py-1.5 pr-4">
                  <div className={isVoid ? "line-through" : "font-medium"}>{name}</div>
                  <div className="text-xs text-muted-foreground">{email}</div>
                </td>
                <td className="py-1.5 pr-4">{r.productLabel || "—"}</td>
                <td className="py-1.5 pr-4">
                  {isVoid ? (
                    <span className="line-through">{money(r.voidedAmount)}</span>
                  ) : (
                    <>
                      {money(r.amount)}
                      {r.voidedAmount > 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground line-through">
                          {money(r.voidedAmount)}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-4">{statusText[r.status]}</td>
                <td className="py-1.5 pr-4">{releaseLabel(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
