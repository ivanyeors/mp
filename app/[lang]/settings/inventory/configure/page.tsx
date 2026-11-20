import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";

import { ConfigureClient, type ConfigureTab } from "./configure-client";

const TABS: readonly ConfigureTab[] = ["products", "visualize", "dimensions", "soft-body"];

export default async function ConfigureInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ lang }, { tab }] = await Promise.all([params, searchParams]);
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("configure", locale);
  return <ConfigureClient initialTab={TABS.find((t) => t === tab) ?? "products"} />;
}
