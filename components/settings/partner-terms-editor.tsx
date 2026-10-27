import { supabaseAdmin } from "@/lib/supabase/server";
import { updatePartnerTerms } from "@/app/[lang]/settings/partner-commissions/actions";
import {
  PARTNER_TERMS_COLUMNS,
  choiceInEffect,
  commissionInEffect,
  customerDiscountInEffect,
  partnerTermsOf,
  sgtDate,
  type PartnerTermsRow,
} from "@/lib/partner-terms";

/**
 * Each approved partner's terms (ADR 0034): the Commission Pool and the customer
 * discount Staff set, beside the share the partner picked in their Partner Hub and
 * any change waiting for the day after the next Payout Date. Staff-only — mounted
 * inside the admin-guarded Partner commissions page; the action re-asserts admin.
 */

type Row = PartnerTermsRow & { id: string; name: string };

const sgd = (n: number) => `S$${n.toFixed(2)}`;

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export async function PartnerTermsEditor() {
  const admin = supabaseAdmin();
  const { data: accounts } = await admin
    .from("partner_users")
    .select("partner_id")
    .eq("application_status", "approved")
    .not("partner_id", "is", null);
  const ids = [...new Set((accounts ?? []).map((a) => a.partner_id as string))];

  const { data } = ids.length
    ? await admin
        .from("partners")
        .select(`id, name, ${PARTNER_TERMS_COLUMNS}`)
        .in("id", ids)
        .order("name", { ascending: true })
    : { data: [] };
  const partners = (data ?? []) as unknown as Row[];
  const today = sgtDate(new Date());

  return (
    <div className="mt-6 space-y-3">
      {partners.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approved partners yet. Set terms when you approve one in Partner applications.
        </div>
      ) : (
        partners.map((p) => {
          const terms = partnerTermsOf(p);
          const takes = commissionInEffect(terms, today);
          const customers = customerDiscountInEffect(terms, today);
          const waiting = terms.nextChoiceFrom && terms.nextChoiceFrom > today ? terms.nextChoiceFrom : null;
          const nextTakes = waiting ? Math.min(terms.nextChoice ?? terms.pool, terms.pool) : null;
          const picked = choiceInEffect(terms, today) != null && takes < terms.pool;
          return (
            <form
              key={p.id}
              action={updatePartnerTerms}
              className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            >
              <input type="hidden" name="partner_id" value={p.id} />
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Partner takes {sgd(takes)}
                    {picked ? " (their choice)" : " (the full pool)"} · customers get{" "}
                    {terms.customerDiscount ? sgd(customers) : "nothing, Mpillow keeps the rest"}
                  </p>
                  {waiting && nextTakes != null ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Changes to {sgd(nextTakes)} from {formatDay(waiting)}, the day after the next
                      Payout Date.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">Commission Pool (S$)</span>
                    <input
                      type="number"
                      name="commission_pool"
                      min="0"
                      step="1"
                      defaultValue={terms.pool}
                      required
                      className="h-9 w-32 rounded-md border bg-background px-2 text-base max-md:min-h-11 md:text-sm"
                    />
                  </label>
                  <label className="flex min-h-9 items-center gap-2 text-sm max-md:min-h-11">
                    <input
                      type="checkbox"
                      name="customer_discount"
                      defaultChecked={terms.customerDiscount}
                      className="size-4"
                    />
                    <span>Pass what they leave to customers</span>
                  </label>
                </div>
              </div>
              <div>
                <button
                  type="submit"
                  className="h-9 rounded-md border bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 max-md:min-h-11"
                >
                  Save
                </button>
              </div>
            </form>
          );
        })
      )}
    </div>
  );
}
