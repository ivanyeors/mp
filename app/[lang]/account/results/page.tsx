import Link from "next/link";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function AccountResultsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) redirect(withLocale("/account/login", locale));

  const customer = await linkCustomerToAuthUser(user);
  const admin = supabaseAdmin();

  type ResultRow = {
    id: string;
    status: string | null;
    suggested_size: string | null;
    suggested_tier: string | null;
    assigned_size: string | null;
    assigned_tier: string | null;
    authorized_amount: number | null;
    final_amount: number | null;
    currency: string | null;
    access_token: string | null;
    created_at: string;
  };
  const selectCols =
    "id, status, suggested_size, suggested_tier, assigned_size, assigned_tier, authorized_amount, final_amount, currency, access_token, created_at";
  const [{ data: byCustomer }, { data: byEmail }] = await Promise.all([
    admin
      .from("mp_config_responses")
      .select(selectCols)
      .eq("customer_id", customer.id)
      .not("status", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    customer.email
      ? admin
          .from("mp_config_responses")
          .select(selectCols)
          .eq("customer_email", customer.email)
          .not("status", "is", null)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as ResultRow[] }),
  ]);
  const seen = new Set<string>();
  const rows = [...((byCustomer ?? []) as ResultRow[]), ...((byEmail ?? []) as ResultRow[])].filter(
    (r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    },
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My results</h1>
          <p className="text-sm text-muted-foreground">
            Customisation submissions under review or awaiting your decision.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={withLocale("/account", locale)}>Account</Link>
        </Button>
      </div>

      <ul className="mt-8 divide-y rounded-lg border">
        {(rows ?? []).length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">No results yet.</li>
        )}
        {(rows ?? []).map((r) => {
          const size = r.assigned_size ?? r.suggested_size;
          const tier = r.assigned_tier ?? r.suggested_tier;
          const href = withLocale(
            `/results/${r.id}${r.access_token ? `?token=${r.access_token}` : ""}`,
            locale,
          );
          return (
            <li key={r.id}>
              <Link
                href={href}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/40"
              >
                <div>
                  <div className="font-medium capitalize">
                    {size ?? "—"} · {tier ?? "—"} tier
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.status ?? "unknown"} ·{" "}
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString()
                      : ""}
                  </div>
                </div>
                <div className="text-sm tabular-nums text-muted-foreground">
                  {(r.final_amount ?? r.authorized_amount) != null
                    ? `${r.currency ?? "SGD"} ${Number(r.final_amount ?? r.authorized_amount).toFixed(2)}`
                    : ""}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
