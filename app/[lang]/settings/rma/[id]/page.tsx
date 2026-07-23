import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { humanizeToken } from "@/lib/rma/admin-view";
import { nextStatuses, type RmaStatus } from "@/lib/rma/transitions";
import {
  saveAdminNoteForm,
  approveRmaForm,
  rejectRmaForm,
  sendInstructionsForm,
} from "../actions";

export const runtime = "nodejs";

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

export default async function RmaDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("orders", locale);

  const admin = supabaseAdmin();
  const to = (href: string) => withLocale(href, locale);

  // Service-role reads (not customer RLS).
  const { data: rmaData } = await admin
    .from("rma_requests")
    .select(
      "id, status, resolution, reason, customer_note, admin_note, photo_urls, tracking_number, tracking_url, created_at, orders(id, order_number), customers(email)",
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
  const hasActions =
    next.includes("approved") ||
    next.includes("rejected") ||
    next.includes("instructions_sent");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
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
          Return {rma.orders?.order_number != null ? `for #${rma.orders.order_number}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {humanizeToken(rma.status)} · {rma.resolution} · opened{" "}
          {formatTimestamp(rma.created_at)}
          {rma.customers?.email ? ` · ${rma.customers.email}` : ""}
        </p>
      </div>

      {/* Returned items */}
      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-2 text-sm font-medium">Returned items</h2>
        {items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No line items.</p>
        ) : (
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
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {it.order_items?.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{it.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
            {photos.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                {/* ponytail: raw links, not thumbnails — v1 photos are customer URLs (ADR 0011) */}
                {url}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Lifecycle actions (slice 05) — only the transitions the state machine allows. */}
      {hasActions ? (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {next.includes("approved") ? (
              <form action={approveRmaForm.bind(null, rma.id)}>
                <button
                  type="submit"
                  className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"
                >
                  Approve
                </button>
              </form>
            ) : null}
            {next.includes("instructions_sent") ? (
              <form action={sendInstructionsForm.bind(null, rma.id)}>
                <button
                  type="submit"
                  className="h-9 rounded-md border bg-background px-3 text-sm hover:bg-accent"
                >
                  Send return instructions
                </button>
              </form>
            ) : null}
          </div>
          {next.includes("rejected") ? (
            <form action={rejectRmaForm.bind(null, rma.id)} className="space-y-2">
              <textarea
                name="reason"
                rows={2}
                required
                placeholder="Reason for rejection (shown to the customer)…"
                className="w-full resize-none rounded-md border bg-background p-2 text-sm"
              />
              <button
                type="submit"
                className="h-9 rounded-md border border-destructive px-3 text-sm text-destructive hover:bg-destructive/10"
              >
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
            className="w-full resize-none rounded-md border bg-background p-2 text-sm"
          />
          <button
            type="submit"
            className="h-9 rounded-md border bg-background px-3 text-sm hover:bg-accent"
          >
            Save note
          </button>
        </form>
      </section>
    </div>
  );
}
