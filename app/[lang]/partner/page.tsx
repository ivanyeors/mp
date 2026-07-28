import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requirePartnerPage } from "@/lib/auth/partner";
import { needsReaccept } from "@/lib/partner-application";
import { ReacceptForm } from "@/components/partner/reaccept-form";
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
    return <ReacceptForm lang={locale} />;
  }

  const greeting = ctx.partnerName ?? ctx.email;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Partner Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">Welcome back, {greeting}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Your partner dashboard is coming soon.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bookings, referrals, and settings will appear here as we roll them out.
          </p>
        </CardContent>
      </Card>
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
