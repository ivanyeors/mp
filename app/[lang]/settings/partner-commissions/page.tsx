import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { COMMISSION_RELEASE_WINDOW_DAYS } from "@/lib/commissions";
import { MilestoneRungsEditor } from "@/components/partner/milestone-rungs-editor";
import { PartnerSelfPurchaseEditor } from "@/components/settings/partner-self-purchase-editor";
import { PartnerTermsEditor } from "@/components/settings/partner-terms-editor";
import { PartnerPayouts } from "./partner-payouts";
import { AdminReferralRows } from "./admin-referral-rows";
import { InfoTip } from "@/components/ui/info-tip";

export const runtime = "nodejs";

export default async function PartnerCommissionsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("partner-commissions", locale);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Partner commissions</h1>
        <InfoTip label="About Partner commissions">
          <p>
            The Referral Partner Agreement pays a flat Commission Pool once per order that holds a
            customised premium pillow. It is held on capture, released{" "}
            {COMMISSION_RELEASE_WINDOW_DAYS} days after delivery, and voided if an eligible pillow
            is refunded.
          </p>
          <p>
            Partners can choose to take less in their Partner Hub. A change starts the day after the
            next Payout Date. When you pass what they leave to customers, it comes off the order of
            a customer who types their code. Only staff set the pool and the discount.
          </p>
        </InfoTip>
      </div>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Partner terms</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A new pool or discount applies to customisations held from now on. One already held keeps
        what it was held with.
      </p>
      <PartnerTermsEditor />

      <div className="mt-10 space-y-10">
        <MilestoneRungsEditor />
        <PartnerSelfPurchaseEditor />
        <PartnerPayouts />
        <AdminReferralRows />
      </div>
    </div>
  );
}
