import { redirect } from "next/navigation";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { loadPartnerRow } from "@/lib/auth/partner";
import { getAgreementMarkdown } from "@/lib/partners";
import { ApplyForm } from "./apply-form";

export default async function PartnerApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ withdrawn?: string }>;
}) {
  const { lang } = await params;
  const { withdrawn } = await searchParams;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user?.email) {
    redirect(withLocale("/account/login?next=/partner/apply", locale));
  }

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
      withdrawn={withdrawn === "1"}
    />
  );
}
