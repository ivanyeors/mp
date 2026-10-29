import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { ACCESS_ENTITY_TYPES, entityTypesFor, permissionDiff } from "@/lib/auth/audit-diff";
import { InfoTip } from "@/components/ui/info-tip";
import { ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/settings/empty-state";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";

export const runtime = "nodejs";

type AuditRow = {
  id: string;
  actor_email: string | null;
  actor_profile_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
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

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ entity?: string | string[] }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("audit-log", locale);

  // Filter chips for the access changes Users & permissions writes; any other
  // value is ignored rather than passed to the query.
  const raw = (await searchParams).entity;
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  const entityTypes = entityTypesFor(wanted);
  const entity = entityTypes?.[0] ?? null;

  const admin = supabaseAdmin();
  let query = admin.from("admin_audit_log").select("*");
  if (entityTypes) query = query.in("entity_type", entityTypes);
  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as AuditRow[];

  // "email · profile" when the actor picked who they were working as.
  const profileIds = [...new Set(rows.map((r) => r.actor_profile_id).filter((id): id is string => !!id))];
  const { data: profiles } = profileIds.length
    ? await admin.from("mp_staff").select("id,name").in("id", profileIds)
    : { data: [] };
  const profileName = new Map(((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const actorProfile = (r: AuditRow) =>
    r.actor_profile_id ? profileName.get(r.actor_profile_id) : undefined;
  const actorLabel = (r: AuditRow) => {
    const profile = actorProfile(r);
    return `${r.actor_email ?? "—"}${profile ? ` as ${profile}` : ""}`;
  };

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={withLocale(href, locale)}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:min-h-11 max-md:px-4",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent active:bg-press",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <InfoTip label="About Audit log">
          A read-only record of every change staff make, newest first.
        </InfoTip>
      </div>

      <nav aria-label="Filter by kind" className="mt-4 flex flex-wrap gap-2 md:mt-6">
        {chip("/settings/audit-log", "All", entity === null)}
        {ACCESS_ENTITY_TYPES.map((e) =>
          chip(
            `/settings/audit-log?entity=${e.type}`,
            e.label,
            entity === e.type,
          ),
        )}
      </nav>

      {rows.length === 0 ? (
        <EmptyState className="mt-4 md:mt-8">No admin actions recorded yet.</EmptyState>
      ) : (
        <>
          <MobileList className="mt-4">
            {rows.map((r) => {
              const summary = (
                <>
                  <p className="truncate text-sm font-medium">
                    {actorLabel(r)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.entity_type} · {r.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatTimestamp(r.created_at)}</p>
                </>
              );
              if (r.before == null && r.after == null) {
                return <MobileListRow key={r.id}>{summary}</MobileListRow>;
              }
              return (
                <li key={r.id}>
                  {/* The whole row opens the changes: one ≥56px target instead of a 16px "View". */}
                  <details className="group">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-3 transition-colors active:bg-press [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">{summary}</div>
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="min-w-0 space-y-2 px-3 pb-3">
                      {r.entity_id ? (
                        <p className="break-all text-[11px] text-muted-foreground">{r.entity_id}</p>
                      ) : null}
                      <AccessDiff before={r.before} after={r.after} />
                      <Snapshots before={r.before} after={r.after} />
                    </div>
                  </details>
                </li>
              );
            })}
          </MobileList>
          <div className="mt-8 hidden min-w-0 overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Actor</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Entity</th>
                  <th className="px-4 py-2 font-medium">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatTimestamp(r.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {r.actor_email ?? "—"}
                      {actorProfile(r) ? (
                        <span className="text-muted-foreground"> as {actorProfile(r)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.entity_type}
                      {r.entity_id ? (
                        <span className="block text-[11px] opacity-70">
                          {r.entity_id}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {r.before == null && r.after == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          <AccessDiff before={r.before} after={r.after} />
                          <details>
                            <summary className="cursor-pointer text-xs text-primary">
                              View
                            </summary>
                            <Snapshots before={r.before} after={r.after} className="mt-2" />
                          </details>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AccessDiff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <>
      {permissionDiff(before, after)?.map((d) => (
        <div key={d.field} className="mb-1 space-y-0.5 text-xs">
          {d.added.length ? (
            <p className="text-green-700 dark:text-green-400">+ {d.added.join(", ")}</p>
          ) : null}
          {d.removed.length ? (
            <p className="text-red-700 dark:text-red-400">− {d.removed.join(", ")}</p>
          ) : null}
          {!d.added.length && !d.removed.length ? (
            <p className="text-muted-foreground">No access change</p>
          ) : null}
        </div>
      ))}
    </>
  );
}

function Snapshots({ before, after, className }: { before: unknown; after: unknown; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-2 md:grid-cols-2", className)}>
      {(
        [
          ["Before", before],
          ["After", after],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
          <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
            {JSON.stringify(value ?? null, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
