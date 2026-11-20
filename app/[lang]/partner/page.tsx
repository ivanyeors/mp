import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { requirePartnerPage } from "@/lib/auth/partner";
import {
  canWithdrawApplication,
  needsReaccept,
  type ApplicationFields,
} from "@/lib/partner-application";
import { applicantLogoFolder, isStoredLogoUrl } from "@/lib/partner-upload/urls";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAgreementMarkdown } from "@/lib/partners";
import { ensureReferralCode } from "@/lib/referrals";
import { getSiteOrigin } from "@/lib/site-url";
import { ReacceptForm } from "@/components/partner/reaccept-form";
import { ListingPreview } from "@/components/partner/listing-preview";
import { WithdrawApplication } from "@/components/partner/withdraw-application";
import { ReferralShareCard } from "@/components/partner/referral-share-card";
import { MilestoneTrack } from "@/components/partner/milestone-track";
import { CommissionChoiceCard } from "@/components/partner/commission-choice-card";
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
    return <PendingApplicationScreen lang={locale} userId={ctx.userId} partnerId={ctx.partnerId} />;
  }

  if (ctx.status === "rejected") {
    return (
      <PartnerStatusScreen
        title="Application not approved"
        body="Your Partner application wasn't approved at this time. If you think this is a mistake, reply to your application email or contact us at sg@mpillow.com and we'll take another look."
      />
    );
  }

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
              is charged to you, and the order is credited to you. Commission is paid on
              customised premium pillows.
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
          <MilestoneTrack partnerId={ctx.partnerId} />
          <CommissionChoiceCard partnerId={ctx.partnerId} />
          <MoneyReferralsPanel partnerId={ctx.partnerId} />
          <PayoutSummary partnerId={ctx.partnerId} />
          <SelfPurchaseAllowanceCard partnerId={ctx.partnerId} />
        </>
      ) : null}
    </div>
  );
}

function PartnerStatusScreen({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-16 pb-[calc(4rem+var(--app-dock-clearance))] text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

async function PendingApplicationScreen({
  lang,
  userId,
  partnerId,
}: {
  lang: Locale;
  userId: string;
  partnerId: string | null;
}) {
  const { data: row } = await supabaseAdmin()
    .from("partner_users")
    .select("questionnaire")
    .eq("auth_user_id", userId)
    .maybeSingle();
  const q = (row?.questionnaire ?? {}) as Partial<ApplicationFields>;
  const canWithdraw = Boolean(row) && canWithdrawApplication("pending", partnerId);
  const logoUrl = isStoredLogoUrl(q.logoUrl, applicantLogoFolder(userId)) ? (q.logoUrl as string) : null;

  return (
    <PartnerStatusScreen
      title="Application under review"
      body="Thanks for applying to the Mpillow Partner programme. We're reviewing your application and will email you once a decision is made."
    >
      {q.companyName ? (
        <section
          aria-labelledby="listing-preview"
          data-typography-scope="app"
          className="space-y-3 pt-6 text-left"
        >
          <div>
            <h2 id="listing-preview" className="text-base font-semibold">
              Your listing on Our partners
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              It goes live when we approve you. After that you can change it in Partner Hub
              settings.
            </p>
          </div>
          <ListingPreview
            name={q.companyName}
            logoUrl={logoUrl}
            description={q.description?.trim() || null}
            website={q.website ?? null}
          />
        </section>
      ) : null}
      {canWithdraw ? (
        <div data-typography-scope="app" className="space-y-2 pt-6">
          <WithdrawApplication lang={lang} />
          <p className="text-xs text-muted-foreground">
            Changed your mind? Withdrawing deletes your application, and you can apply again any
            time.
          </p>
        </div>
      ) : null}
    </PartnerStatusScreen>
  );
}
