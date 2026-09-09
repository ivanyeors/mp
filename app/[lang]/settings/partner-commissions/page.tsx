import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { COMMISSION_RELEASE_WINDOW_DAYS } from "@/lib/commissions";
import { upsertCommissionScheme } from "./actions";
import { MilestoneRungsEditor } from "@/components/partner/milestone-rungs-editor";
import { PartnerSelfPurchaseEditor } from "@/components/settings/partner-self-purchase-editor";
import { PartnerPayouts } from "./partner-payouts";
import { AdminReferralRows } from "./admin-referral-rows";

export const runtime = "nodejs";

type SchemeRow = {
  id: string;
  partner_id: string | null;
  product_type: string;
  kind: string;
  amount: number | string;
  partners: { name: string | null } | null;
};

type PartnerOption = { id: string; name: string };

function formatAmount(kind: string, amount: number): string {
  return kind === "percent" ? `${amount}%` : `$${amount.toFixed(2)}`;
}

export default async function PartnerCommissionsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  // Reuses the "page-builder" permission (partner surfaces) — no new permission minted.
  await requireAdminPage("page-builder", locale);

  const admin = supabaseAdmin();
  const [{ data: schemeData }, { data: partnerData }] = await Promise.all([
    admin
      .from("commission_schemes")
      .select("id, partner_id, product_type, kind, amount, partners(name)")
      .order("partner_id", { ascending: true, nullsFirst: true })
      .order("product_type", { ascending: true }),
    admin
      .from("partners")
      .select("id, name")
      .eq("type", "partner")
      .not("referral_code", "is", null)
      .order("name", { ascending: true }),
  ]);

  const schemes = (schemeData ?? []) as unknown as SchemeRow[];
  const partners = (partnerData ?? []) as PartnerOption[];

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Partner Commissions</h1>
        <p className="text-sm text-muted-foreground">
          Commission schemes for partner-referred pillow &amp; bolster units. Held on capture,
          released {COMMISSION_RELEASE_WINDOW_DAYS} days after delivery, voided on refund. Staff
          only — never shown in the Partner Hub. Milestone rungs, self-purchase rates, and payouts
          are managed below.
        </p>
      </div>

      <div className="mt-6 min-w-0 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {schemes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No schemes yet.
                </td>
              </tr>
            ) : (
              schemes.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-3">
                    {s.partner_id ? (
                      s.partners?.name ?? "Partner override"
                    ) : (
                      <span className="font-medium">DEFAULT</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{s.product_type}</td>
                  <td className="px-4 py-3 capitalize">{s.kind}</td>
                  <td className="px-4 py-3">{formatAmount(s.kind, Number(s.amount))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Upsert form — a plain server-action form, no client JS. Empty partner = DEFAULT. */}
      <form
        action={upsertCommissionScheme}
        className="mt-8 grid max-w-xl grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2"
      >
        <h2 className="sm:col-span-2 text-sm font-medium">Add / update a scheme</h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Partner (blank = DEFAULT)</span>
          <select name="partner_id" defaultValue="" className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm">
            <option value="">— DEFAULT —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Product type</span>
          <select name="product_type" defaultValue="pillow" className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm">
            <option value="pillow">Pillow</option>
            <option value="bolster">Bolster</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Kind</span>
          <select name="kind" defaultValue="percent" className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm">
            <option value="percent">Percent of base</option>
            <option value="flat">Flat $ per unit</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Amount (% or $)</span>
          <input
            type="number"
            name="amount"
            min="0"
            step="0.01"
            defaultValue="10"
            required
            className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="h-9 max-md:min-h-11 rounded-md border bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Save scheme
          </button>
        </div>
      </form>

      {/* Wave-3 admin surfaces (self-contained; each guards with assertAdmin). */}
      <div className="mt-10 space-y-10">
        <MilestoneRungsEditor />
        <PartnerSelfPurchaseEditor />
        <PartnerPayouts />
        {/* Same referral rows as the hub, unmasked (#80, AC5). */}
        <AdminReferralRows />
      </div>
    </div>
  );
}
