import { requireAdminPage } from "@/lib/auth/admin";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { loadReadjustmentPolicy, loadServicePrices } from "@/lib/pricing/service-prices";
import { supabaseAdmin } from "@/lib/supabase/server";
import ServiceFeesClient from "./services-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Costings → Service fees (ADR 0024). Guarded by `costings` like its parent page:
 * services are priced in Costings, so whoever may set an MSRP may set a fee.
 *
 * A failed read renders an error rather than the seed values — presenting
 * defaults as the saved prices would let an operator save them over real ones.
 */
export default async function ServiceFeesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("costings", locale);

  const admin = supabaseAdmin();
  let initial: Awaited<ReturnType<typeof load>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await load(admin);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Couldn't load service fees.";
  }
  return <ServiceFeesClient initial={initial} loadError={loadError} />;
}

async function load(admin: ReturnType<typeof supabaseAdmin>) {
  const [services, readjustmentPolicy] = await Promise.all([
    loadServicePrices(admin),
    loadReadjustmentPolicy(admin),
  ]);
  return { services, readjustmentPolicy };
}
