import { supabaseAdmin } from "@/lib/supabase/server";
import { upsertSelfPurchaseRate } from "@/app/[lang]/settings/partner-commissions/self-purchase-actions";
import { InfoTip } from "@/components/ui/info-tip";

type Row = {
  id: string;
  name: string;
  self_purchase_kind: string | null;
  self_purchase_amount: number | string | null;
  self_purchase_unit_cap: number | null;
};

function formatRate(row: Row): string {
  const cap = Number(row.self_purchase_unit_cap ?? 0);
  if (!row.self_purchase_kind || cap <= 0) return "—";
  const amount = Number(row.self_purchase_amount ?? 0);
  const rate = row.self_purchase_kind === "percent" ? `${amount}%` : `$${amount.toFixed(2)}/unit`;
  return `${rate} · cap ${cap}`;
}

export async function PartnerSelfPurchaseEditor() {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("partners")
    .select("id, name, self_purchase_kind, self_purchase_amount, self_purchase_unit_cap")
    .eq("type", "partner")
    .not("referral_code", "is", null)
    .order("name", { ascending: true });

  const partners = (data ?? []) as Row[];

  return (
    <div className="mt-12 border-t pt-8">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">Partner self-purchase pricing</h2>
        <InfoTip label="About Partner self-purchase pricing">
          <p>
            A signed-in partner buying pillows &amp; bolsters in their OWN account gets this rate off
            MSRP, up to the unit cap.
          </p>
          <p>
            Self-purchases earn NO commission and never count toward the Milestone track — the better
            price is the reward. Over-cap units price normally. Staff only.
          </p>
        </InfoTip>
      </div>

      <div className="mt-6 min-w-0 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Partner</th>
              <th className="px-4 py-2 font-medium">Self-purchase rate</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {partners.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                  No partners with a referral code yet.
                </td>
              </tr>
            ) : (
              partners.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{formatRate(p)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form
        action={upsertSelfPurchaseRate}
        className="mt-8 grid max-w-xl grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2"
      >
        <h3 className="sm:col-span-2 text-sm font-medium">Set a partner&apos;s self-purchase rate</h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Partner</span>
          <select name="partner_id" required defaultValue="" className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base active:bg-press md:text-sm">
            <option value="" disabled>
              — Select partner —
            </option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Kind</span>
          <select name="kind" defaultValue="percent" className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base active:bg-press md:text-sm">
            <option value="percent">Percent off MSRP</option>
            <option value="flat">Flat $ off per unit</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Amount (% or $)</span>
          <input
            type="number"
            name="amount"
            min="0"
            step="0.01"
            defaultValue="20"
            required
            className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Unit cap (0 = off)</span>
          <input
            type="number"
            name="unit_cap"
            min="0"
            step="1"
            defaultValue="0"
            required
            className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="h-9 rounded-md border bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 max-md:min-h-11"
          >
            Save self-purchase rate
          </button>
        </div>
      </form>
    </div>
  );
}
