import Link from "next/link";
import { toWebUrl } from "@/lib/format/web-url";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { humanizeToken } from "@/lib/rma/admin-view";
import { nextStatuses, type RmaStatus } from "@/lib/rma/transitions";
import { PageActions } from "@/components/ui/page-actions";
import {
  saveAdminNoteForm,
  approveRmaForm,
  rejectRmaForm,
  sendInstructionsForm,
  markReceivedForm,
  completeReturnForm,
  issueRmaRefundForm,
} from "../actions";

export const runtime = "nodejs";

/**
 * This page predates the shared `Button` (it is a Server Component, and
 * `Button` is client-only), so the lifecycle actions style themselves. They
 * still take the `PageActions` tile shape on mobile.
 */
const rmaActionBase =
  "inline-flex w-full items-center justify-center rounded-md px-3 text-sm transition-colors " +
  "h-9 max-md:h-auto max-md:min-h-14 max-md:whitespace-normal max-md:py-2 max-md:leading-tight md:w-auto";
const rmaPrimaryAction = `${rmaActionBase} bg-primary text-primary-foreground hover:opacity-90 active:opacity-80`;
const rmaSecondaryAction = `${rmaActionBase} border bg-background hover:bg-accent active:bg-press`;
const rmaDestructiveAction = `${rmaActionBase} border border-destructive text-destructive hover:bg-destructive/10 active:bg-destructive/20`;

type ItemRow = {
  id: string;
  quantity: number;
  order_items: {
    product_title: string | null;
    variant_title: string | null;
    sku: string | null;
  } | null;
};

type EventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  reason: string | null;
  created_at: string;
};

type RmaRow = {
  id: string;
  status: string;
  resolution: string;
  reason: string | null;
  customer_note: string | null;
  admin_note: string | null;
  photo_urls: string[] | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  orders: { order_number: number | string | null; id: string } | null;
  customers: { id: string; email: string | null } | null;
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

export default async function RmaDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await requireAdminPage("returns", locale);

  const admin = supabaseAdmin();
  const to = (href: string) => withLocale(href, locale);

  // Service-role reads (not customer RLS).
  const { data: rmaData } = await admin
    .from("rma_requests")
    .select(
      "id, status, resolution, reason, customer_note, admin_note, photo_urls, tracking_number, tracking_url, created_at, orders(id, order_number), customers(id, email)",
    )
    .eq("id", id)
    .maybeSingle();

  const rma = rmaData as unknown as RmaRow | null;
  if (!rma) notFound();

  const [{ data: itemsData }, { data: eventsData }] = await Promise.all([
    admin
      .from("rma_request_items")
      .select("id, quantity, order_items(product_title, variant_title, sku)")
      .eq("rma_request_id", id),
    admin
      .from("rma_status_events")
      .select("id, from_status, to_status, actor, reason, created_at")
      .eq("rma_request_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const items = (itemsData ?? []) as unknown as ItemRow[];
  const events = (eventsData ?? []) as unknown as EventRow[];
  const photos = rma.photo_urls ?? [];
  const next = nextStatuses(rma.status as RmaStatus);
  const isRefund = rma.resolution === "refund";
  const hasActions = next.length > 0;
  // Hand-offs to the Customer and the Order (PRD-crm-retention-loop slice 02),
  // each only for Staff who can open it.
  const customerHref =
    rma.customers?.id && hasPermission(ctx, "customers") ? to(`/settings/customers/${rma.customers.id}`) : null;
  const orderHref = rma.orders?.id && hasPermission(ctx, "orders") ? to(`/settings/orders/${rma.orders.id}`) : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 md:space-y-6">
      {/* Phones: the shell breadcrumb already leads back to the queue. */}
      <div className="flex items-center gap-3 max-md:hidden">
        <Link
          href={to("/settings/rma")}
          className="inline-flex items-center text-sm text-muted-foreground hover:underline"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Returns / RMA
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Return{" "}
          {rma.orders?.order_number != null ? (
            orderHref ? (
              <Link href={orderHref} className="underline-offset-4 hover:underline active:opacity-60">
                for #{rma.orders.order_number}
              </Link>
            ) : (
              `for #${rma.orders.order_number}`
            )
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          {humanizeToken(rma.status)} · {rma.resolution} · opened{" "}
          {formatTimestamp(rma.created_at)}
          {rma.customers?.email ? (
            <>
              {" · "}
              {customerHref ? (
                <Link href={customerHref} className="font-medium text-foreground underline-offset-4 hover:underline active:opacity-60">
                  {rma.customers.email}
                </Link>
              ) : (
                rma.customers.email
              )}
            </>
          ) : null}
        </p>
      </div>

      {/* Returned items */}
      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-2 text-sm font-medium">Returned items</h2>
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No line items.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-3">
                    {it.order_items?.product_title ?? "—"}
                    {it.order_items?.variant_title ? (
                      <span className="block text-xs text-muted-foreground">
                        {it.order_items.variant_title}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {it.order_items?.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {/* Reason + customer note */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium">Reason</h2>
          <p className="mt-1 text-sm text-muted-foreground">{rma.reason ?? "—"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium">Customer note</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {rma.customer_note ?? "—"}
          </p>
        </div>
      </section>

      {/* Photos */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Photos</h2>
        {photos.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No photos attached.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((url) =>
              // Customer-typed: a link only when it is a web link.
              toWebUrl(url) ? (
                <a
                  key={url}
                  href={toWebUrl(url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:break-all"
                >
                  {/* ponytail: raw links, not thumbnails — v1 photos are customer URLs (ADR 0011) */}
                  {url}
                </a>
              ) : (
                <span key={url} className="text-xs text-muted-foreground">
                  {url}
                </span>
              ),
            )}
          </div>
        )}
      </section>

      {/* Lifecycle actions (slice 05) — only the transitions the state machine allows. */}
      {hasActions ? (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Actions</h2>
          {/* The form is the grid/flex item; the button fills it, so a lifecycle
              action is the same tile size as every other page action. */}
          <PageActions>
            {next.includes("approved") ? (
              <form action={approveRmaForm.bind(null, rma.id)} className="w-full md:w-auto">
                <button type="submit" className={rmaPrimaryAction}>
                  Approve
                </button>
              </form>
            ) : null}
            {next.includes("instructions_sent") ? (
              <form action={sendInstructionsForm.bind(null, rma.id)} className="w-full md:w-auto">
                <button type="submit" className={rmaSecondaryAction}>
                  Send return instructions
                </button>
              </form>
            ) : null}
            {next.includes("received") ? (
              <form action={markReceivedForm.bind(null, rma.id)} className="w-full md:w-auto">
                <button type="submit" className={rmaSecondaryAction}>
                  Mark received
                </button>
              </form>
            ) : null}
            {next.includes("refunded") && isRefund ? (
              <form action={issueRmaRefundForm.bind(null, rma.id)} className="w-full md:w-auto">
                <button type="submit" className={rmaPrimaryAction}>
                  Issue refund
                </button>
              </form>
            ) : null}
          </PageActions>

          {next.includes("completed") && !isRefund ? (
            <form action={completeReturnForm.bind(null, rma.id)} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  name="tracking_number"
                  placeholder="Tracking number (optional)"
                  className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                />
                <input
                  name="tracking_url"
                  placeholder="Tracking URL (optional)"
                  className="h-9 max-md:min-h-11 rounded-md border bg-background px-2 text-base md:text-sm"
                />
              </div>
              <button type="submit" className={rmaPrimaryAction}>
                Complete return
              </button>
            </form>
          ) : null}
          {next.includes("rejected") ? (
            <form action={rejectRmaForm.bind(null, rma.id)} className="space-y-2">
              <textarea
                name="reason"
                rows={2}
                required
                placeholder="Reason for rejection (shown to the customer)…"
                className="w-full resize-none rounded-md border bg-background p-2 text-base md:text-sm"
              />
              <button type="submit" className={rmaDestructiveAction}>
                Reject return
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {/* Status timeline — the customer-visible history of every transition. */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Status timeline</h2>
        {events.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-muted-foreground">{formatTimestamp(e.created_at)}</span>
                <span className="mx-2">·</span>
                <span className="font-medium">
                  {e.from_status ? `${humanizeToken(e.from_status)} → ` : ""}
                  {humanizeToken(e.to_status)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  by {humanizeToken(e.actor)}
                </span>
                {e.reason ? (
                  <p className="mt-0.5 text-muted-foreground">{e.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Admin note — the audited proving mutation. */}
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Internal note (staff only)</h2>
        <form action={saveAdminNoteForm.bind(null, rma.id)} className="mt-2 space-y-2">
          <textarea
            name="note"
            rows={4}
            defaultValue={rma.admin_note ?? ""}
            placeholder="Add an internal note visible only to staff…"
            className="w-full resize-none rounded-md border bg-background p-2 text-base md:text-sm"
          />
          <button type="submit" className={rmaSecondaryAction}>
            Save note
          </button>
        </form>
      </section>
    </div>
  );
}
