import { supabaseAdmin } from "@/lib/supabase/server";
import { loadPartnerMoneyReferrals } from "@/lib/commissions/referral-rows";
import { ReferralRowsTable } from "@/components/partner/referral-rows";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const money = (n: number) => `$${n.toFixed(2)}`;

export async function MoneyReferralsPanel({ partnerId }: { partnerId: string }) {
  const { totals, headlineCustomers, pipelineCount, rows } = await loadPartnerMoneyReferrals(
    supabaseAdmin(),
    partnerId,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Commissions &amp; referrals</CardTitle>
        <CardDescription>
          Commission is held on each attributed order, released once its return window
          closes, then paid out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Held" value={money(totals.held)} hint="in return window" />
          <Stat label="Released" value={money(totals.released)} hint="payable now" />
          <Stat label="Paid" value={money(totals.paid)} hint="paid out" />
          <Stat label="All-time earned" value={money(totals.allTime)} hint="excl. voided" />
        </div>

        <div className="rounded-md border p-3">
          <div className="text-2xl font-semibold tracking-tight">
            {headlineCustomers} referred customer{headlineCustomers === 1 ? "" : "s"}
          </div>
          <p className="text-xs text-muted-foreground">
            Distinct customers with a paid, attributed order.
          </p>
          {pipelineCount > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {pipelineCount} more in progress — configured, not yet purchased.
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Your referrals</div>
          <ReferralRowsTable rows={rows} emptyLabel="No attributed orders yet." />
          <p className="mt-2 text-xs text-muted-foreground">
            Customers you assisted in person show full details for verification; customers
            from your link or code stay masked for their privacy.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
