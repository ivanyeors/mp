import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AuditRow = {
  id: string;
  actor_email: string | null;
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
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  await requireAdminPage("audit-log", locale);

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          A read-only record of mutating admin actions, newest first.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          No admin actions recorded yet.
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-lg border">
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
                  <td className="px-4 py-3">{r.actor_email ?? "—"}</td>
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
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">
                          View
                        </summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground">Before</p>
                            <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                              {JSON.stringify(r.before ?? null, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-muted-foreground">After</p>
                            <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                              {JSON.stringify(r.after ?? null, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </details>
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
