import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { isRuleFlow } from "@/lib/rules-engine";
import { RulesEngineWorkbenchLazy } from "@/components/rules-engine/workbench-lazy";

export default async function RulesEngineFlowPage({
  params,
}: {
  params: Promise<{ lang: string; flow: string }>;
}) {
  const { lang, flow } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);
  if (!isRuleFlow(flow)) notFound();
  return <RulesEngineWorkbenchLazy flow={flow} />;
}
