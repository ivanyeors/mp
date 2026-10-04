import Link from "next/link";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { withLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { ACCESS_ENTITY_TYPES, entityTypesFor, permissionDiff } from "@/lib/auth/audit-diff";

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

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={withLocale(href, locale)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          A read-only record of mutating admin actions, newest first.
        </p>
      </div>

      <nav aria-label="Filter by kind" className="mt-6 flex flex-wrap gap-2">
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
        <div className="mt-8 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No admin actions recorded yet.
        </div>
      ) : (
        <div className="mt-8 min-w-0 overflow-x-auto rounded-lg border">
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
                    {r.actor_profile_id && profileName.get(r.actor_profile_id) ? (
                      <span className="text-muted-foreground"> · {profileName.get(r.actor_profile_id)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.entity_type}
                    {r.entity_id ? (
                      <span className="block font-mono text-[11px] opacity-70">
                        {r.entity_id}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.before == null && r.after == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        {permissionDiff(r.before, r.after)?.map((d) => (
                          <div
                            key={d.field}
                            className="mb-1 space-y-0.5 text-xs"
                          >
                            {d.added.length ? (
                              <p className="text-green-700 dark:text-green-400">
                                + {d.added.join(", ")}
                              </p>
                            ) : null}
                            {d.removed.length ? (
                              <p className="text-red-700 dark:text-red-400">
                                − {d.removed.join(", ")}
                              </p>
                            ) : null}
                            {!d.added.length && !d.removed.length ? (
                              <p className="text-muted-foreground">
                                No access change
                              </p>
                            ) : null}
                          </div>
                        ))}
                        <details>
                          <summary className="cursor-pointer text-xs text-primary">
                            View
                          </summary>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Before
                              </p>
                              <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                                {JSON.stringify(r.before ?? null, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                After
                              </p>
                              <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                                {JSON.stringify(r.after ?? null, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
