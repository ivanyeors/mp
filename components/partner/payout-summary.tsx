import { supabaseAdmin } from "@/lib/supabase/server";
import { releasedBalance } from "@/lib/commissions/ledger";
import { signedImageUrl } from "@/lib/payout-upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PayoutRow = {
  id: string;
  amount: number | string;
  paid_on: string;
  method: string | null;
  reference: string | null;
  proof_path: string | null;
};

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Partner Hub payout view (#81) — a self-contained async server component. Shows
 * the accumulated released balance (no minimum, AC5), full payout history with
 * status, and the proof-of-payment image (full transparency, AC4). Ownership is
 * enforced by scoping every query to the caller's own `partnerId`; the private
 * proof images are read through short-lived signed URLs, so a partner can only
 * ever see their own.
 */
export async function PayoutSummary({ partnerId }: { partnerId: string }) {
  const admin = supabaseAdmin();
  const balance = await releasedBalance(admin, partnerId); // settles due first
  const { data } = await admin
    .from("partner_payouts")
    .select("id, amount, paid_on, method, reference, proof_path")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as PayoutRow[];
  const proofUrls = await Promise.all(rows.map((r) => signedImageUrl(r.proof_path)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payouts</CardTitle>
        <CardDescription>
          Commission is released after each order&apos;s return window closes, then
          paid out manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Available balance
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{money(balance)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Released commissions not yet paid. Add your PayNow QR or bank details in{" "}
            Settings so we can pay you.
          </p>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Payout history</div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4 font-medium">Date</th>
                    <th className="py-1 pr-4 font-medium">Amount</th>
                    <th className="py-1 pr-4 font-medium">Status</th>
                    <th className="py-1 pr-4 font-medium">Method</th>
                    <th className="py-1 pr-4 font-medium">Reference</th>
                    <th className="py-1 pr-4 font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => {
                    const amt = Number(r.amount);
                    return (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-4">{r.paid_on}</td>
                        <td className="py-1.5 pr-4">{money(amt)}</td>
                        <td className="py-1.5 pr-4">{amt < 0 ? "Correction" : "Paid"}</td>
                        <td className="py-1.5 pr-4">{r.method ?? "—"}</td>
                        <td className="py-1.5 pr-4">{r.reference ?? "—"}</td>
                        <td className="py-1.5 pr-4">
                          {proofUrls[i] ? (
                            <a
                              href={proofUrls[i] as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline"
                            >
                              View
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
