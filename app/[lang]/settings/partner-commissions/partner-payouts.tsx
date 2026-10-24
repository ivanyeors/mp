import { supabaseAdmin } from "@/lib/supabase/server";
import { settleDueCommissions } from "@/lib/commissions/ledger";
import { signedImageUrl } from "@/lib/payout-upload";
import { PAYOUT_IMAGE_ALLOWED_MIME } from "@/lib/payout-upload/limits";
import { recordPayoutAction } from "./payout-actions";
import { InfoTip } from "@/components/ui/info-tip";

type PartnerRow = { id: string; name: string | null };
type DetailsRow = {
  partner_id: string;
  paynow_qr_path: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
};
type PayoutRow = {
  id: string;
  partner_id: string;
  amount: number | string;
  paid_on: string;
  method: string | null;
  reference: string | null;
  proof_path: string | null;
  created_by: string | null;
  created_at: string;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Admin payout workflow (#81) — a self-contained async server component mounted on
 * the Partner Commissions page. Per partner: RELEASED balance, payment details
 * (PayNow QR inline via a short-lived signed URL + bank fields), a record-payout
 * form (proof upload → server action), and immutable payout history. Staff-only:
 * the parent page already gates with requireAdminPage("partner-commissions"), and the
 * server action re-asserts assertAdmin("partner-commissions").
 */
export async function PartnerPayouts() {
  const admin = supabaseAdmin();

  // Settle once here, then read persisted `released` rows — cheaper than settling
  // per partner (settleDueCommissions scans all held rows).
  await settleDueCommissions(admin);

  const [{ data: partnerData }, { data: releasedData }, { data: detailsData }, { data: payoutData }] =
    await Promise.all([
      admin
        .from("partners")
        .select("id, name")
        .eq("type", "partner")
        .not("referral_code", "is", null),
      admin
        .from("commissions")
        .select("partner_id, commission_amount")
        .eq("status", "released")
        .is("payout_id", null),
      admin
        .from("partner_payment_details")
        .select("partner_id, paynow_qr_path, bank_name, bank_account_name, bank_account_number"),
      admin
        .from("partner_payouts")
        .select("id, partner_id, amount, paid_on, method, reference, proof_path, created_by, created_at")
        .order("created_at", { ascending: false }),
    ]);

  const partners = (partnerData ?? []) as PartnerRow[];
  const details = new Map((detailsData ?? []).map((d) => [d.partner_id, d as DetailsRow]));

  const balanceCents = new Map<string, number>();
  for (const r of releasedData ?? []) {
    const c = Math.round(Number(r.commission_amount) * 100);
    balanceCents.set(r.partner_id, (balanceCents.get(r.partner_id) ?? 0) + c);
  }

  const payoutsByPartner = new Map<string, PayoutRow[]>();
  for (const p of (payoutData ?? []) as PayoutRow[]) {
    const list = payoutsByPartner.get(p.partner_id) ?? [];
    list.push(p);
    payoutsByPartner.set(p.partner_id, list);
  }

  // Only show partners that have a balance, saved payment details, or history.
  const rows = partners
    .filter(
      (p) =>
        (balanceCents.get(p.id) ?? 0) !== 0 ||
        details.has(p.id) ||
        payoutsByPartner.has(p.id),
    )
    .sort((a, b) => (balanceCents.get(b.id) ?? 0) - (balanceCents.get(a.id) ?? 0));

  // Sign every private image up front (QR + proofs) — scoped strictly to the rows
  // we loaded, so no cross-partner exposure.
  const qrUrls = new Map<string, string | null>(
    await Promise.all(
      rows.map(async (p): Promise<[string, string | null]> => [
        p.id,
        await signedImageUrl(details.get(p.id)?.paynow_qr_path),
      ]),
    ),
  );
  const proofUrls = new Map<string, string | null>(
    await Promise.all(
      (payoutData ?? []).map(async (p): Promise<[string, string | null]> => [
        p.id,
        await signedImageUrl(p.proof_path),
      ]),
    ),
  );

  return (
    <section className="mt-12 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-xl font-semibold tracking-tight">Payouts</h2>
        <InfoTip label="About Payouts">
          <p>
            Manual payouts (ADR 0015). Released balance = commissions past the return
            window, not yet paid.
          </p>
          <p>
            Recording a payout marks the covered commissions{" "}
            <span className="font-mono">paid</span> and is immutable — a mistake is
            corrected with a new negative entry, never an edit. No minimum threshold.
          </p>
        </InfoTip>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
          No partners with a balance, payment details, or payout history yet.
        </p>
      ) : (
        rows.map((p) => {
          const bal = (balanceCents.get(p.id) ?? 0) / 100;
          const d = details.get(p.id);
          const qr = qrUrls.get(p.id) ?? null;
          const history = payoutsByPartner.get(p.id) ?? [];
          return (
            <div key={p.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{p.name ?? "Unnamed partner"}</h3>
                <div className="text-sm">
                  Released balance:{" "}
                  <span className="font-semibold">{money(bal)}</span>
                </div>
              </div>

              {/* Payment details */}
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="text-sm">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    PayNow QR
                  </div>
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="PayNow QR"
                      className="mt-1 h-40 w-40 rounded-md border object-contain"
                    />
                  ) : (
                    <p className="mt-1 text-muted-foreground">Not provided.</p>
                  )}
                </div>
                <div className="text-sm">
                  <div className="text-xs font-medium uppercase text-muted-foreground">
                    Bank
                  </div>
                  {d?.bank_name || d?.bank_account_number ? (
                    <ul className="mt-1 space-y-0.5">
                      <li>{d?.bank_name ?? "—"}</li>
                      <li>{d?.bank_account_name ?? "—"}</li>
                      <li className="font-mono">{d?.bank_account_number ?? "—"}</li>
                    </ul>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Not provided.</p>
                  )}
                </div>
              </div>

              {/* Record a payout — native form → server action; proof is a real file input. */}
              <form
                action={recordPayoutAction}
                encType="multipart/form-data"
                className="mt-4 grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2"
              >
                <input type="hidden" name="partner_id" value={p.id} />
                <h4 className="text-sm font-medium sm:col-span-2">Record a payout</h4>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Amount (negative = correction)</span>
                  <input
                    type="number"
                    name="amount"
                    step="0.01"
                    defaultValue={bal > 0 ? bal.toFixed(2) : ""}
                    required
                    className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Paid on</span>
                  <input
                    type="date"
                    name="paid_on"
                    defaultValue={today()}
                    required
                    className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Method</span>
                  <input
                    type="text"
                    name="method"
                    placeholder="PayNow / bank transfer"
                    className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Reference</span>
                  <input
                    type="text"
                    name="reference"
                    placeholder="Txn ref"
                    className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">Proof of payment (image)</span>
                  <input
                    type="file"
                    name="proof"
                    accept={PAYOUT_IMAGE_ALLOWED_MIME.join(",")}
                    className="text-sm"
                  />
                </label>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="h-9 max-md:min-h-11 rounded-md border bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Record payout
                  </button>
                </div>
              </form>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-4 min-w-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-4 font-medium">Paid on</th>
                        <th className="py-1 pr-4 font-medium">Amount</th>
                        <th className="py-1 pr-4 font-medium">Method</th>
                        <th className="py-1 pr-4 font-medium">Reference</th>
                        <th className="py-1 pr-4 font-medium">Proof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td className="py-1.5 pr-4">{h.paid_on}</td>
                          <td className="py-1.5 pr-4">{money(Number(h.amount))}</td>
                          <td className="py-1.5 pr-4">{h.method ?? "—"}</td>
                          <td className="py-1.5 pr-4">{h.reference ?? "—"}</td>
                          <td className="py-1.5 pr-4">
                            {proofUrls.get(h.id) ? (
                              <a
                                href={proofUrls.get(h.id) as string}
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
