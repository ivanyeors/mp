import { requireAdminPage } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import {
  APPLICATION_FIELD_LABELS,
  BUSINESS_CATEGORY_LABELS,
  type ApplicationFields,
  type BusinessCategory,
} from "@/lib/partner-application";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReviewActions } from "./review-actions";

interface PendingApplication {
  id: string;
  email: string;
  questionnaire: Partial<ApplicationFields> | null;
  created_at: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Human value for one questionnaire field (category → label). */
function fieldValue(field: keyof ApplicationFields, q: Partial<ApplicationFields>): string {
  const raw = q[field];
  if (raw == null || String(raw).trim() === "") return "—";
  if (field === "category") {
    return BUSINESS_CATEGORY_LABELS[raw as BusinessCategory] ?? String(raw);
  }
  return String(raw);
}

export default async function PartnerApplicationsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  await requireAdminPage("page-builder", locale);

  const { data } = await supabaseAdmin()
    .from("partner_users")
    .select("id, email, questionnaire, created_at")
    .eq("application_status", "pending")
    .order("created_at", { ascending: true });

  const applications = (data ?? []) as PendingApplication[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Partner applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review pending applications. Verify ACRA / website yourself, then approve or
          reject. Approving creates a hidden partner location — flip visibility later in
          Partners.
        </p>
      </div>

      {applications.length === 0 ? (
        <div className="rounded-xl border border-dashed p-14 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No pending applications.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const q = app.questionnaire ?? {};
            return (
              <Card key={app.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      {q.companyName || app.email}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {app.email} · applied {formatDate(app.created_at)}
                    </p>
                  </div>
                  <ReviewActions id={app.id} />
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {APPLICATION_FIELD_LABELS.map(([field, label]) => (
                      <div
                        key={field}
                        className={field === "introPlan" ? "sm:col-span-2" : undefined}
                      >
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                          {fieldValue(field, q)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
