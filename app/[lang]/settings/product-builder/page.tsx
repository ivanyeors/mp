import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export default async function ProductBuilderRedirect({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(withLocale("/settings/inventory/configure?tab=visualize", isSupportedLocale(lang) ? lang : DEFAULT_LOCALE));
}
