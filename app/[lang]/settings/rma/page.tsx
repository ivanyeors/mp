import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseStatusFilter, humanizeToken, RMA_STATUSES } from "@/lib/rma/admin-view";
import { InfoTip } from "@/components/ui/info-tip";

export const runtime = "nodejs";

type QueueRow = {
  id: string;
  status: string;
  resolution: string;
  reason: string | null;
  created_at: string;
  orders: { order_number: number | string | null } | null;
  customers: { email: string | null } | null;
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RmaQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  // The Returns page's own permission (ADR 0023; split from "orders", ADR 0011).
  await requireAdminPage("returns", locale);

  const { status: rawStatus } = await searchParams;
  const status = parseStatusFilter(rawStatus);

  // Service-role read (not customer RLS): join order number + customer email.
  const admin = supabaseAdmin();
  let query = admin
    .from("rma_requests")
    .select(
      "id, status, resolution, reason, created_at, orders(order_number), customers(email)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const rows = (data ?? []) as unknown as QueueRow[];

  const to = (href: string) => withLocale(href, locale);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Returns / RMA</h1>
        <InfoTip label="About Returns / RMA">
          Return requests appear here, newest first. Open one to review it.
        </InfoTip>
      </div>

      {/* Status filter — a plain GET form, no client JS needed. */}
      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <label htmlFor="status" className="text-sm text-muted-foreground">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ""}
          className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
        >
          <option value="">All statuses</option>
          {RMA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanizeToken(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 max-md:min-h-11 rounded-md border bg-background px-3 text-sm hover:bg-accent"
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No return requests{status ? ` with status “${humanizeToken(status)}”` : ""} yet.
        </div>
      ) : (
        <div className="mt-6 min-w-0 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Resolution</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    <Link href={to(`/settings/rma/${r.id}`)} className="hover:underline">
                      {formatTimestamp(r.created_at)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.orders?.order_number != null ? `#${r.orders.order_number}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.customers?.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{r.resolution}</td>
                  <td className="px-4 py-3">{humanizeToken(r.status)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
