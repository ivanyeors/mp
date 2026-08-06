import { redirect } from "next/navigation";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { loadPartnerRow } from "@/lib/auth/partner";
import { getAgreementMarkdown } from "@/lib/partners";
import { ApplyForm } from "./apply-form";

export default async function PartnerApplyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user?.email) {
    redirect(withLocale("/account/login?next=/partner/apply", locale));
  }

  // Already applied / a partner in any state → the hub owns their screen.
  const existing = await loadPartnerRow(user);
  if (existing) {
    redirect(withLocale("/partner", locale));
  }

  const agreementMd = await getAgreementMarkdown();
  return (
    <ApplyForm
      lang={locale}
      initialEmail={user.email.toLowerCase().trim()}
      agreementMd={agreementMd}
    />
  );
}
