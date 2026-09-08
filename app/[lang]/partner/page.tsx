import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { requirePartnerPage } from "@/lib/auth/partner";
import { needsReaccept } from "@/lib/partner-application";
import { getAgreementMarkdown } from "@/lib/partners";
import { ensureReferralCode } from "@/lib/referrals";
import { getSiteOrigin } from "@/lib/site-url";
import { ReacceptForm } from "@/components/partner/reaccept-form";
import { ReferralShareCard } from "@/components/partner/referral-share-card";
import { MilestoneTrack } from "@/components/partner/milestone-track";
import { MoneyReferralsPanel } from "@/components/partner/money-referrals-panel";
import { PayoutSummary } from "@/components/partner/payout-summary";
import { SelfPurchaseAllowanceCard } from "@/components/partner/self-purchase-allowance-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PartnerHubPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const ctx = await requirePartnerPage(locale);

  if (ctx.status === "pending") {
    return (
      <PartnerStatusScreen
        title="Application under review"
        body="Thanks for applying to the Mpillow Partner programme. We're reviewing your application and will email you once a decision is made."
      />
    );
  }

  if (ctx.status === "rejected") {
    return (
      <PartnerStatusScreen
        title="Application not approved"
        body="Your Partner application wasn't approved at this time. If you think this is a mistake, reply to your application email or contact us at sg@mpillow.com and we'll take another look."
      />
    );
  }

  // approved — but re-accept first if the agreement version has moved on.
  if (needsReaccept(ctx.agreedVersion)) {
    const agreementMd = await getAgreementMarkdown();
    return <ReacceptForm lang={locale} agreementMd={agreementMd} />;
  }

  const greeting = ctx.partnerName ?? ctx.email;
  const referralCode = ctx.partnerId ? await ensureReferralCode(ctx.partnerId) : null;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-10 pb-[calc(2.5rem+var(--app-dock-clearance))]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partner Hub</h1>
          <p className="mt-2 text-sm text-muted-foreground">Welcome back, {greeting}.</p>
        </div>
        <Button asChild variant="outline">
          <Link href={withLocale("/partner/settings", locale)}>Settings</Link>
        </Button>
      </div>

      {referralCode ? (
        <ReferralShareCard code={referralCode} siteOrigin={getSiteOrigin()} />
      ) : null}

      {referralCode ? (
        <Card>
          <CardHeader>
            <CardTitle>Customise for a customer</CardTitle>
            <CardDescription>
              Open the configurator in partner mode. Your customer answers the same
              questions and enters their own card for the authorization hold — nothing
              is charged to you, and the order is credited to you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`${withLocale("/mp-config", locale)}?partner=${referralCode}`}>
                Customise a Mpillow
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`${withLocale("/mbolster-config", locale)}?partner=${referralCode}`}>
                Customise a Mbolster
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {ctx.partnerId ? (
        <>
          {/* Milestone track = the gamified spine the partner sees first (#79). */}
          <MilestoneTrack partnerId={ctx.partnerId} />
          {/* Money totals + referral pipeline + masked per-referral rows (#80). */}
          <MoneyReferralsPanel partnerId={ctx.partnerId} />
          {/* Commission balance + payout history with proof (#81). */}
          <PayoutSummary partnerId={ctx.partnerId} />
          {/* Remaining self-purchase allowance — renders null when the feature is off (#82). */}
          <SelfPurchaseAllowanceCard partnerId={ctx.partnerId} />
        </>
      ) : null}
    </div>
  );
}

function PartnerStatusScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
