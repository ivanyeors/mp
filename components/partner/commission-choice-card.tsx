import { supabaseAdmin } from "@/lib/supabase/server";
import { COMMISSION_RELEASE_WINDOW_DAYS } from "@/lib/commissions";
import {
  PARTNER_TERMS_COLUMNS,
  commissionInEffect,
  customerDiscountInEffect,
  partnerTermsOf,
  sgtDate,
  type PartnerTermsRow,
} from "@/lib/partner-terms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CommissionChoiceForm } from "./commission-choice-form";

const sgd = (n: number) => `S$${n.toFixed(2)}`;

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export async function CommissionChoiceCard({ partnerId }: { partnerId: string }) {
  const { data } = await supabaseAdmin()
    .from("partners")
    .select(PARTNER_TERMS_COLUMNS)
    .eq("id", partnerId)
    .maybeSingle();
  if (!data) return null;

  const terms = partnerTermsOf(data as PartnerTermsRow);
  const today = sgtDate(new Date());
  const takes = commissionInEffect(terms, today);
  const customersGet = customerDiscountInEffect(terms, today);
  const waitingFrom = terms.nextChoiceFrom && terms.nextChoiceFrom > today ? terms.nextChoiceFrom : null;
  const waitingTakes = waitingFrom ? Math.min(terms.nextChoice ?? terms.pool, terms.pool) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your commission</CardTitle>
        <CardDescription>
          The Commission Pool is {sgd(terms.pool)} per qualifying sale: an order with a customised
          premium pillow, once its {COMMISSION_RELEASE_WINDOW_DAYS}-day refund period ends with no
          refund. It is paid on the last business day of the month after the sale qualifies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">You take per sale</dt>
            <dd className="mt-0.5 text-lg font-semibold">{sgd(takes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Your customers get off</dt>
            <dd className="mt-0.5 text-lg font-semibold">{terms.customerDiscount ? sgd(customersGet) : "S$0.00"}</dd>
          </div>
        </dl>

        {waitingFrom && waitingTakes != null ? (
          <p className="rounded-md border border-dashed p-3 text-sm">
            Changing to {sgd(waitingTakes)} per sale from {formatDay(waitingFrom)}, the day after the
            next Payout Date. Sales paid before then stay at {sgd(takes)}.
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {terms.customerDiscount
            ? "Mpillow passes the part of the pool you don't take to customers who use your Promo Code, as money off a customised premium pillow."
            : "The part of the pool you don't take goes back to Mpillow."}
        </p>

        <CommissionChoiceForm
          pool={terms.pool}
          current={waitingTakes ?? takes}
          customerDiscount={terms.customerDiscount}
        />
      </CardContent>
    </Card>
  );
}
