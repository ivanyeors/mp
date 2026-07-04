import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Entry point: open the latest Result status page (or empty state). */
export default async function ResultsIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const resultsHref = withLocale("/results", locale);

  const user = await getAuthUser();
  if (!user) {
    redirect(
      withLocale(`/account/login?next=${encodeURIComponent(resultsHref)}`, locale),
    );
  }

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();
  const selectCols = "id, access_token, created_at";

  const [{ data: byCustomer }, { data: byEmail }] = await Promise.all([
    admin
      .from("mp_config_responses")
      .select(selectCols)
      .eq("customer_id", customer.id)
      .not("status", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
    customer.email
      ? admin
          .from("mp_config_responses")
          .select(selectCols)
          .eq("customer_email", customer.email)
          .not("status", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as Array<{ id: string; access_token: string | null }> }),
  ]);

  const latest = (byCustomer?.[0] ?? byEmail?.[0]) as
    | { id: string; access_token: string | null }
    | undefined;

  if (latest) {
    const q = latest.access_token ? `?token=${latest.access_token}` : "";
    redirect(withLocale(`/results/${latest.id}${q}`, locale));
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <p className="mt-2 text-sm text-muted-foreground">No results yet.</p>
      </div>
    </div>
  );
}
