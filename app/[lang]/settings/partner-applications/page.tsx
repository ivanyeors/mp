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
import { applicantLogoFolder, isStoredLogoUrl } from "@/lib/partner-upload/urls";
import { ReviewActions } from "./review-actions";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/settings/empty-state";

interface PendingApplication {
  id: string;
  auth_user_id: string | null;
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
function fieldValue(
  field: Exclude<keyof ApplicationFields, "logoUrl">,
  q: Partial<ApplicationFields>,
): string {
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
  await requireAdminPage("partner-applications", locale);

  const { data } = await supabaseAdmin()
    .from("partner_users")
    .select("id, auth_user_id, email, questionnaire, created_at")
    .eq("application_status", "pending")
    .order("created_at", { ascending: true });

  const applications = (data ?? []) as PendingApplication[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Partner applications</h1>
        <InfoTip label="About Partner applications">
          Verify ACRA and the website yourself, then approve or reject. Approving sets the
          partner&apos;s Commission Pool and customer discount, issues their Promo Code and lists
          them on Our partners with the logo and write-up they sent, unless you keep the listing
          hidden. They can change it later in Partner Hub.
        </InfoTip>
      </div>

      {applications.length === 0 ? (
        <EmptyState>No pending applications.</EmptyState>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const q = app.questionnaire ?? {};
            // Only the applicant's own upload is shown: the questionnaire is jsonb.
            const logoUrl =
              app.auth_user_id && isStoredLogoUrl(q.logoUrl, applicantLogoFolder(app.auth_user_id))
                ? (q.logoUrl as string)
                : null;
            return (
              <Card key={app.id}>
                {/* Phones: the actions get their own full-width row, so the name and email aren't squeezed. */}
                <CardHeader className="flex flex-col gap-3 space-y-0 md:flex-row md:items-start md:justify-between md:gap-4">
                  <div className="min-w-0 max-md:w-full">
                    <CardTitle className="break-words max-md:leading-snug md:truncate">
                      {q.companyName || app.email}
                    </CardTitle>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {app.email}, applied {formatDate(app.created_at)}
                    </p>
                  </div>
                  <ReviewActions id={app.id} companyName={q.companyName || app.email} />
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Logo
                      </dt>
                      <dd className="mt-1">
                        {logoUrl ? (
                          // A raw <img>: the URL is verified as our own storage above.
                          <img
                            src={logoUrl}
                            alt={`${q.companyName || app.email} logo`}
                            className="h-16 w-16 rounded-md border bg-background object-contain"
                          />
                        ) : (
                          <span className="text-sm">None sent</span>
                        )}
                      </dd>
                    </div>
                    {APPLICATION_FIELD_LABELS.map(([field, label]) => (
                      <div
                        key={field}
                        className={
                          field === "introPlan" || field === "description" ? "sm:col-span-2" : undefined
                        }
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
